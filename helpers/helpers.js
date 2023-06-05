export function calculateTokenNumber(string) {
  return string.split(/['" ,.!?]/).filter(word => !!word).length;
}
