import React, { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserRouter, Routes, Route, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import Dial from './components/Dial';
import './App.css';

// Same colors as in Dial.js - keep in sync!
const USER_COLORS = [
  '#6366f1', // indigo (you)
  '#f472b6', // pink
  '#22d3ee', // cyan
  '#a78bfa', // purple
  '#fb923c', // orange
  '#4ade80', // green
  '#fbbf24', // amber
  '#f87171', // red
  '#2dd4bf', // teal
  '#c084fc', // violet
];

// WebSocket connection hook
const useWebSocket = (roomId = 'global', userName = null) => {
  const [isConnected, setIsConnected] = useState(false);
  const [userId, setUserId] = useState(null);
  const [roomName, setRoomName] = useState('');
  const [globalBoredom, setGlobalBoredom] = useState(50);
  const [userCount, setUserCount] = useState(0);
  const [individuals, setIndividuals] = useState([]);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let wsUrl = `${protocol}//${window.location.host}/ws?room=${roomId}`;
    if (userName) {
      wsUrl += `&name=${encodeURIComponent(userName)}`;
    }

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'welcome') {
            setUserId(data.userId);
            setRoomName(data.roomName || '');
            setGlobalBoredom(data.average || 50);
            setUserCount(data.count || 0);
            setIndividuals(data.individuals || []);
          } else if (data.type === 'stats') {
            setGlobalBoredom(data.average || 50);
            setUserCount(data.count || 0);
            setIndividuals(data.individuals || []);
          }
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 2000);
      };

      ws.onerror = () => {
        setError('Connection error');
      };
    } catch (err) {
      setError('Failed to connect');
    }
  }, [roomId, userName]);

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  const sendBoredom = useCallback((value) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'update',
        boredom: value
      }));
    }
  }, []);

  const sendName = useCallback((name) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'setName',
        name: name
      }));
    }
  }, []);

  return {
    isConnected,
    userId,
    roomName,
    globalBoredom,
    userCount,
    individuals,
    error,
    sendBoredom,
    sendName
  };
};

// Mini dial with user-specific color
const MiniDial = ({ value, label, isYou, isBot, userColor }) => {
  const size = 80;
  const center = size / 2;
  const radius = size * 0.35;
  const strokeWidth = size * 0.1;

  const valueToAngle = (val) => -135 + (val / 100) * 270;

  const getPointOnCircle = (angle, r = radius) => {
    const radians = (angle - 90) * (Math.PI / 180);
    return {
      x: center + r * Math.cos(radians),
      y: center + r * Math.sin(radians)
    };
  };

  const createArc = (startAngle, endAngle, r = radius) => {
    const start = getPointOnCircle(startAngle, r);
    const end = getPointOnCircle(endAngle, r);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };

  const currentAngle = valueToAngle(value);

  return (
    <div className={`mini-dial ${isYou ? 'is-you' : ''} ${isBot ? 'is-bot' : ''}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <path
          d={createArc(-135, 135)}
          fill="none"
          stroke="#1e1e2e"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
        {value > 0 && (
          <path
            d={createArc(-135, currentAngle)}
            fill="none"
            stroke={userColor}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        )}
        <text
          x={center}
          y={center + 4}
          textAnchor="middle"
          fill="#ffffff"
          fontSize={size * 0.22}
          fontWeight="bold"
        >
          {Math.round(value)}
        </text>
      </svg>
      <div className="mini-dial-label" style={{ color: userColor }}>
        {isYou ? 'You' : label || 'User'}
        {isBot && <span className="bot-badge">bot</span>}
      </div>
    </div>
  );
};

// Home page - create or join room
function HomePage() {
  const navigate = useNavigate();
  const [roomCode, setRoomCode] = useState('');
  const [roomName, setRoomName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const createRoom = async () => {
    setCreating(true);
    setError('');
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: roomName || undefined })
      });
      const data = await res.json();
      if (data.roomId) {
        navigate(`/room/${data.roomId}`);
      } else {
        setError('Failed to create room');
      }
    } catch (err) {
      setError('Failed to create room');
    }
    setCreating(false);
  };

  const joinRoom = () => {
    const code = roomCode.trim().toUpperCase();
    if (code.length === 6) {
      navigate(`/room/${code}`);
    } else {
      setError('Room code must be 6 characters');
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1>Collective Boredom Dial</h1>
        <p className="subtitle">How bored are we, really?</p>
      </header>

      <main className="home-content">
        <div className="home-options">
          <div className="home-card">
            <h2>Join Global Room</h2>
            <p>See how the world feels right now</p>
            <button className="btn btn-primary" onClick={() => navigate('/room/global')}>
              Enter Global Room
            </button>
          </div>

          <div className="home-divider">
            <span>or</span>
          </div>

          <div className="home-card">
            <h2>Create Private Room</h2>
            <p>Start a boredom session with your group</p>
            <input
              type="text"
              placeholder="Room name (optional)"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="input-field"
            />
            <button
              className="btn btn-secondary"
              onClick={createRoom}
              disabled={creating}
            >
              {creating ? 'Creating...' : 'Create Room'}
            </button>
          </div>

          <div className="home-divider">
            <span>or</span>
          </div>

          <div className="home-card">
            <h2>Join Private Room</h2>
            <p>Enter a 6-character room code</p>
            <input
              type="text"
              placeholder="ROOM CODE"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase().slice(0, 6))}
              className="input-field room-code-input"
              maxLength={6}
            />
            <button
              className="btn btn-secondary"
              onClick={joinRoom}
              disabled={roomCode.length !== 6}
            >
              Join Room
            </button>
          </div>
        </div>

        {error && <p className="error-message">{error}</p>}
      </main>

      <footer className="app-footer">
        <p className="credits">A collective experiment in quantifying ennui</p>
      </footer>
    </div>
  );
}

// Room view - full dial experience
function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [myBoredom, setMyBoredom] = useState(50);
  const [showShare, setShowShare] = useState(false);
  const { isConnected, userId, roomName, globalBoredom, userCount, individuals, error, sendBoredom } = useWebSocket(roomId);

  const handleBoredomChange = useCallback((value) => {
    setMyBoredom(value);
    sendBoredom(value);
  }, [sendBoredom]);

  const myContribution = userCount > 0 ? 100 / userCount : 100;

  // Build segments with live local value for self
  const segments = individuals.map(ind => ({
    ...ind,
    boredom: ind.id === userId ? myBoredom : ind.boredom
  }));

  // Sort for consistent color assignment (same as in Dial.js)
  const sortedForColors = [...segments].sort((a, b) => {
    if (a.id === userId) return -1;
    if (b.id === userId) return 1;
    return a.id.localeCompare(b.id);
  });

  // Create color map
  const colorMap = {};
  sortedForColors.forEach((seg, index) => {
    colorMap[seg.id] = USER_COLORS[index % USER_COLORS.length];
  });

  // Others for the mini-dial grid (excluding self)
  const others = sortedForColors.filter(u => u.id !== userId);

  const shareUrl = `${window.location.origin}/join/${roomId}`;
  const isGlobal = roomId === 'global';

  const copyToClipboard = () => {
    navigator.clipboard.writeText(shareUrl);
  };

  return (
    <div className="app">
      <header className="app-header">
        <button className="back-btn" onClick={() => navigate('/')}>
          Back
        </button>
        <div className="header-content">
          <h1>{roomName || 'Collective Boredom Dial'}</h1>
          {!isGlobal && (
            <p className="room-code-display">Room: {roomId}</p>
          )}
        </div>
        {!isGlobal && (
          <button className="share-btn" onClick={() => setShowShare(!showShare)}>
            Share
          </button>
        )}
      </header>

      {showShare && !isGlobal && (
        <div className="share-modal" onClick={() => setShowShare(false)}>
          <div className="share-content" onClick={(e) => e.stopPropagation()}>
            <h3>Share this room</h3>
            <div className="qr-container">
              <QRCodeSVG
                value={shareUrl}
                size={200}
                bgColor="#1e1e2e"
                fgColor="#ffffff"
                level="M"
              />
            </div>
            <p className="share-code">Room Code: <strong>{roomId}</strong></p>
            <div className="share-url">
              <input type="text" value={shareUrl} readOnly />
              <button onClick={copyToClipboard}>Copy</button>
            </div>
            <button className="btn btn-secondary close-btn" onClick={() => setShowShare(false)}>
              Close
            </button>
          </div>
        </div>
      )}

      <main className="main-content">
        <div className="dials-row">
          <div className="dial-section individual">
            <Dial
              value={myBoredom}
              onChange={handleBoredomChange}
              size={240}
              interactive={true}
              label="Your Boredom"
              color="dynamic"
            />
            <p className="dial-hint">Drag to adjust</p>
          </div>

          <div className="dial-connector">
            <div className="connector-line"></div>
            <div className="contribution-badge">
              <span className="contribution-value">{myContribution.toFixed(0)}%</span>
              <span className="contribution-label">influence</span>
            </div>
            <div className="connector-line"></div>
          </div>

          <div className="dial-section global">
            <Dial
              value={globalBoredom}
              size={280}
              interactive={false}
              label="Collective Boredom"
              color="#8b5cf6"
              segments={segments}
              userId={userId}
            />
            <div className="user-count-badge">
              {userCount} {userCount === 1 ? 'person' : 'people'}
            </div>
          </div>
        </div>

        <div className="participants-section">
          <h2 className="participants-title">Everyone's Boredom</h2>
          <div className="participants-grid">
            <MiniDial
              value={myBoredom}
              label="You"
              isYou={true}
              isBot={false}
              userColor={colorMap[userId] || USER_COLORS[0]}
            />
            {others.map((user) => (
              <MiniDial
                key={user.id}
                value={user.boredom}
                label={user.name}
                isYou={false}
                isBot={user.isBot}
                userColor={colorMap[user.id]}
              />
            ))}
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <p className={`status-message ${error ? 'error' : ''}`}>
          {error || (isConnected ? 'Connected' : 'Connecting...')}
        </p>
        <p className="credits">A collective experiment in quantifying ennui</p>
      </footer>
    </div>
  );
}

// Mobile participant view - simplified for quick input
function JoinPage() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const [myBoredom, setMyBoredom] = useState(50);
  const [name, setName] = useState(searchParams.get('name') || '');
  const [hasJoined, setHasJoined] = useState(false);
  const { isConnected, userId, roomName, globalBoredom, userCount, error, sendBoredom, sendName } = useWebSocket(roomId, name || undefined);

  const handleJoin = () => {
    if (name.trim()) {
      sendName(name.trim());
    }
    setHasJoined(true);
  };

  const handleBoredomChange = useCallback((value) => {
    setMyBoredom(value);
    sendBoredom(value);
  }, [sendBoredom]);

  if (!hasJoined) {
    return (
      <div className="app mobile-app">
        <header className="app-header compact">
          <h1>Join Boredom Room</h1>
          <p className="room-code-display">{roomName || `Room ${roomId}`}</p>
        </header>

        <main className="join-content">
          <div className="join-form">
            <input
              type="text"
              placeholder="Your name (optional)"
              value={name}
              onChange={(e) => setName(e.target.value.slice(0, 20))}
              className="input-field"
              autoFocus
            />
            <button className="btn btn-primary btn-large" onClick={handleJoin}>
              Join Room
            </button>
          </div>
        </main>

        <footer className="app-footer">
          <p className={`status-message ${error ? 'error' : ''}`}>
            {error || (isConnected ? 'Connected' : 'Connecting...')}
          </p>
        </footer>
      </div>
    );
  }

  return (
    <div className="app mobile-app">
      <header className="app-header compact">
        <h1>{roomName || 'Boredom Room'}</h1>
        <p className="user-count-inline">{userCount} {userCount === 1 ? 'person' : 'people'}</p>
      </header>

      <main className="mobile-content">
        <div className="mobile-dial-section">
          <Dial
            value={myBoredom}
            onChange={handleBoredomChange}
            size={260}
            interactive={true}
            label="Your Boredom"
            color="dynamic"
          />
          <p className="dial-hint">Drag to set your boredom level</p>
        </div>

        <div className="mobile-collective">
          <div className="collective-preview">
            <span className="collective-label">Collective:</span>
            <span className="collective-value">{Math.round(globalBoredom)}</span>
          </div>
        </div>
      </main>

      <footer className="app-footer">
        <p className={`status-message ${error ? 'error' : ''}`}>
          {error || (isConnected ? 'Connected' : 'Connecting...')}
        </p>
      </footer>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
        <Route path="/join/:roomId" element={<JoinPage />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
