export function caseInsensitiveFilterOption(input, option) {
  const text = String(option?.label ?? option?.children ?? '');
  return text.toLowerCase().includes(input.toLowerCase());
}
