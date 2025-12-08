import React, { useRef, useCallback, useEffect, useState } from 'react';

// Distinct colors for each user
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

const Dial = ({
  value = 50,
  onChange,
  size = 280,
  interactive = true,
  label = 'Boredom',
  color = '#6366f1',
  trackColor = '#1e1e2e',
  segments = null,
  userId = null
}) => {
  const svgRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);

  const center = size / 2;
  const radius = size * 0.38;
  const strokeWidth = size * 0.08;
  const knobRadius = size * 0.06;

  const ARC_DEGREES = 270;
  const START_ANGLE = -135;
  const END_ANGLE = 135;

  const valueToAngle = (val) => START_ANGLE + (val / 100) * ARC_DEGREES;

  const angleToValue = (angle) => {
    let normalized = angle;
    if (normalized < START_ANGLE) normalized = START_ANGLE;
    if (normalized > END_ANGLE) normalized = END_ANGLE;
    return Math.round(((normalized - START_ANGLE) / ARC_DEGREES) * 100);
  };

  const getPointOnCircle = (angle, r = radius) => {
    const radians = (angle - 90) * (Math.PI / 180);
    return {
      x: center + r * Math.cos(radians),
      y: center + r * Math.sin(radians)
    };
  };

  const createArc = (startAngle, endAngle, r = radius) => {
    if (Math.abs(endAngle - startAngle) < 0.1) return '';
    const start = getPointOnCircle(startAngle, r);
    const end = getPointOnCircle(endAngle, r);
    const largeArc = Math.abs(endAngle - startAngle) > 180 ? 1 : 0;
    return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
  };

  const handleInteraction = useCallback((clientX, clientY) => {
    if (!interactive || !onChange) return;

    const svg = svgRef.current;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const scaleX = size / rect.width;
    const scaleY = size / rect.height;
    const x = (clientX - rect.left) * scaleX - center;
    const y = (clientY - rect.top) * scaleY - center;

    let angle = Math.atan2(y, x) * (180 / Math.PI) + 90;

    if (angle > 180) angle = angle - 360;
    if (angle < -180) angle = angle + 360;

    if (angle > END_ANGLE) angle = END_ANGLE;
    if (angle < START_ANGLE) angle = START_ANGLE;

    const newValue = angleToValue(angle);
    onChange(newValue);
  }, [interactive, onChange, center, size]);

  const handleMouseDown = (e) => {
    if (!interactive) return;
    e.preventDefault();
    setIsDragging(true);
    handleInteraction(e.clientX, e.clientY);
  };

  const handleMouseMove = useCallback((e) => {
    if (!isDragging) return;
    handleInteraction(e.clientX, e.clientY);
  }, [isDragging, handleInteraction]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleTouchStart = (e) => {
    if (!interactive) return;
    e.preventDefault();
    setIsDragging(true);
    const touch = e.touches[0];
    handleInteraction(touch.clientX, touch.clientY);
  };

  const handleTouchMove = useCallback((e) => {
    if (!isDragging) return;
    const touch = e.touches[0];
    handleInteraction(touch.clientX, touch.clientY);
  }, [isDragging, handleInteraction]);

  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      window.addEventListener('touchmove', handleTouchMove);
      window.addEventListener('touchend', handleMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('touchmove', handleTouchMove);
        window.removeEventListener('touchend', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp, handleTouchMove]);

  const currentAngle = valueToAngle(value);
  const knobPosition = getPointOnCircle(currentAngle);

  const getBoredomLabel = (val) => {
    if (val < 15) return 'Engaged';
    if (val < 30) return 'Content';
    if (val < 50) return 'Neutral';
    if (val < 70) return 'Restless';
    if (val < 85) return 'Bored';
    return 'Very Bored';
  };

  const getBoredomColor = (val) => {
    if (val < 30) return '#22c55e';
    if (val < 50) return '#84cc16';
    if (val < 70) return '#eab308';
    if (val < 85) return '#f97316';
    return '#ef4444';
  };

  const dynamicColor = color === 'dynamic' ? getBoredomColor(value) : color;

  // Render segmented arc - fills to average value, segments show contribution
  const renderSegments = () => {
    if (!segments || segments.length === 0) return null;

    const totalBoredom = segments.reduce((sum, s) => sum + s.boredom, 0);
    if (totalBoredom === 0) return null;

    // Calculate average and the arc degrees it fills
    const average = totalBoredom / segments.length;
    const filledDegrees = (average / 100) * ARC_DEGREES;

    const segmentElements = [];
    let currentAngle = START_ANGLE;

    // Sort: "You" first, then others by ID
    const sorted = [...segments].sort((a, b) => {
      if (a.id === userId) return -1;
      if (b.id === userId) return 1;
      return a.id.localeCompare(b.id);
    });

    sorted.forEach((segment, index) => {
      // Each segment's size is proportional to their boredom within the filled area
      const proportion = segment.boredom / totalBoredom;
      const arcDegrees = proportion * filledDegrees;
      const endAngle = currentAngle + arcDegrees;

      if (arcDegrees > 0.3) {
        const segmentColor = USER_COLORS[index % USER_COLORS.length];
        const isYou = segment.id === userId;

        segmentElements.push(
          <path
            key={segment.id}
            d={createArc(currentAngle, endAngle)}
            fill="none"
            stroke={segmentColor}
            strokeWidth={isYou ? strokeWidth * 1.15 : strokeWidth}
            strokeLinecap="butt"
            opacity={isYou ? 1 : 0.9}
            style={{
              filter: isYou ? `drop-shadow(0 0 ${size * 0.02}px ${segmentColor})` : 'none'
            }}
          />
        );

        // Separator lines between segments
        if (index < sorted.length - 1 && arcDegrees > 1.5) {
          const innerPoint = getPointOnCircle(endAngle, radius - strokeWidth / 2);
          const outerPoint = getPointOnCircle(endAngle, radius + strokeWidth / 2);
          segmentElements.push(
            <line
              key={`sep-${segment.id}`}
              x1={innerPoint.x}
              y1={innerPoint.y}
              x2={outerPoint.x}
              y2={outerPoint.y}
              stroke="#0f0f1a"
              strokeWidth={2}
            />
          );
        }
      }

      currentAngle = endAngle;
    });

    return segmentElements;
  };

  const centerColor = segments ? getBoredomColor(value) : dynamicColor;

  return (
    <div className="dial-container">
      <svg
        ref={svgRef}
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ cursor: interactive ? 'pointer' : 'default' }}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
      >
        {/* Background track */}
        <path
          d={createArc(START_ANGLE, END_ANGLE)}
          fill="none"
          stroke={trackColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />

        {/* Segmented arc OR single value arc */}
        {segments ? (
          renderSegments()
        ) : (
          value > 0 && (
            <path
              d={createArc(START_ANGLE, currentAngle)}
              fill="none"
              stroke={dynamicColor}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              style={{
                filter: `drop-shadow(0 0 ${size * 0.02}px ${dynamicColor})`
              }}
            />
          )
        )}

        {/* Tick marks */}
        {[0, 25, 50, 75, 100].map((tick) => {
          const tickAngle = valueToAngle(tick);
          const inner = getPointOnCircle(tickAngle, radius - strokeWidth / 2 - 8);
          const outer = getPointOnCircle(tickAngle, radius - strokeWidth / 2 - 2);
          return (
            <line
              key={tick}
              x1={inner.x}
              y1={inner.y}
              x2={outer.x}
              y2={outer.y}
              stroke="#666"
              strokeWidth={2}
            />
          );
        })}

        {/* Interactive knob */}
        {interactive && (
          <circle
            cx={knobPosition.x}
            cy={knobPosition.y}
            r={knobRadius}
            fill="#ffffff"
            stroke={dynamicColor}
            strokeWidth={3}
            style={{
              filter: 'drop-shadow(0 2px 4px rgba(0,0,0,0.3))'
            }}
          />
        )}

        {/* Center text */}
        <text
          x={center}
          y={center - size * 0.05}
          textAnchor="middle"
          fill={centerColor}
          fontSize={size * 0.15}
          fontWeight="bold"
          style={{ userSelect: 'none' }}
        >
          {Math.round(value)}
        </text>

        <text
          x={center}
          y={center + size * 0.08}
          textAnchor="middle"
          fill={centerColor}
          fontSize={size * 0.055}
          fontWeight="600"
          style={{ userSelect: 'none' }}
        >
          {getBoredomLabel(value)}
        </text>
      </svg>

      <div className="dial-label">{label}</div>
    </div>
  );
};

export default Dial;
