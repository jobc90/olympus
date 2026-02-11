/**
 * ANSI 이스케이프 코드 제거 유틸리티
 *
 * node-pty 출력에서 ANSI 시퀀스(컬러, 커서 이동, OSC 등)를 제거하여
 * 순수 텍스트를 추출합니다.
 */

// eslint-disable-next-line no-control-regex
const ANSI_REGEX = new RegExp(
  [
    // CSI sequences: \x1b[...X or \x9b...X (colors, cursor movement, erase, etc.)
    '[\\u001b\\u009b]\\[[\\]()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nq-uy=><~]',
    // OSC sequences: \x1b]...BEL or \x1b]...\x1b\\ (terminal title, hyperlinks, etc.)
    '\\u001b\\][^\\u0007\\u001b]*(?:\\u0007|\\u001b\\\\)',
    // Charset designators: \x1b(0, \x1b)B, etc.
    '\\u001b[()][012AB]',
    // 2-char escape sequences
    '\\u001b[=>7-9FGHMNOclmno~]',
  ].join('|'),
  'g',
);

// eslint-disable-next-line no-control-regex
const CONTROL_CHAR_REGEX = /[\x00-\x08\x0b\x0c\x0e-\x1f]/g;

export function stripAnsi(str: string): string {
  return str
    .replace(ANSI_REGEX, '')
    .replace(CONTROL_CHAR_REGEX, ''); // \t, \n, \r 제외한 제어 문자 제거
}
