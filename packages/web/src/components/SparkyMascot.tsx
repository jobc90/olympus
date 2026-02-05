import React from 'react';
import mascotImg from '../assets/mascot_nobg.png';

interface Props {
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

export function SparkyMascot({ size = 'md', animated = true }: Props) {
  const sizeMap = {
    sm: 64,
    md: 96,
    lg: 128,
  };

  const pixelSize = sizeMap[size];

  return (
    <img
      src={mascotImg}
      alt="Olympus mascot"
      width={pixelSize}
      height={pixelSize}
      className={`select-none ${animated ? 'animate-bounce-slow' : ''}`}
      style={{
        objectFit: 'contain',
      }}
    />
  );
}
