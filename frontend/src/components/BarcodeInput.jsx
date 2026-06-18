import { useRef, useEffect, useCallback } from 'react';
import { Input } from 'antd';

export function useBarcodeInput(onScan) {
  const inputRef = useRef(null);

  const focus = useCallback(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  useEffect(() => {
    focus();
  }, [focus]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const value = e.target.value.trim();
      if (value) {
        onScan(value);
        e.target.value = '';
      }
      focus();
    }
  };

  return { inputRef, handleKeyDown, focus };
}

export function BarcodeInput({ onScan, placeholder, size = 'large', style }) {
  const { inputRef, handleKeyDown, focus } = useBarcodeInput(onScan);

  return (
    <Input
      ref={inputRef}
      size={size}
      placeholder={placeholder || 'Отсканируйте товар или введите штрихкод'}
      onKeyDown={handleKeyDown}
      onBlur={focus}
      autoComplete="off"
      style={style}
    />
  );
}
