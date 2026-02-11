import { describe, it, expect } from 'vitest';
import { stripAnsi } from '../utils/strip-ansi.js';

describe('stripAnsi', () => {
  it('ANSI 컬러 코드 제거', () => {
    expect(stripAnsi('\u001b[31mred text\u001b[0m')).toBe('red text');
    expect(stripAnsi('\u001b[32mgreen\u001b[39m normal')).toBe('green normal');
    expect(stripAnsi('\u001b[1;34mblue bold\u001b[0m')).toBe('blue bold');
  });

  it('커서 이동 시퀀스 제거', () => {
    expect(stripAnsi('\u001b[2Jcleared')).toBe('cleared');
    expect(stripAnsi('\u001b[Hhome')).toBe('home');
    expect(stripAnsi('\u001b[5Aup five')).toBe('up five');
  });

  it('bold, underline 등 스타일 코드 제거', () => {
    expect(stripAnsi('\u001b[1mbold\u001b[22m')).toBe('bold');
    expect(stripAnsi('\u001b[4munderline\u001b[24m')).toBe('underline');
    expect(stripAnsi('\u001b[7mreverse\u001b[27m')).toBe('reverse');
  });

  it('유니코드/한국어 텍스트 보존', () => {
    expect(stripAnsi('안녕하세요 세계')).toBe('안녕하세요 세계');
    expect(stripAnsi('\u001b[31m한국어\u001b[0m 텍스트')).toBe('한국어 텍스트');
    expect(stripAnsi('日本語テスト')).toBe('日本語テスト');
  });

  it('빈 문자열 처리', () => {
    expect(stripAnsi('')).toBe('');
  });

  it('ANSI 코드 없는 텍스트는 그대로 반환', () => {
    expect(stripAnsi('plain text')).toBe('plain text');
    expect(stripAnsi('hello world\nline 2')).toBe('hello world\nline 2');
  });

  it('복합 ANSI 시퀀스 처리', () => {
    const input = '\u001b[1;31;40m\u001b[2JBold Red on Black\u001b[0m\n\u001b[4;36mUnderline Cyan\u001b[0m';
    expect(stripAnsi(input)).toBe('Bold Red on Black\nUnderline Cyan');
  });
});
