// Pulls a trailing floor/unit designation (e.g. "4,5층", "301호") off the end of an
// address string. Daum's postcode search only returns a standardized road address plus
// a bare building name — never floor/unit — so applying its result straight to the
// address field silently drops any floor/unit the existing address text had (e.g.
// "...샘플빌딩 4,5층" -> address_detail only gets "샘플빌딩", the "4,5층" is lost). Call
// this on the address value *before* it gets overwritten by a "주소 갱신" search result,
// and fold the return value into address_detail alongside buildingName.
const FLOOR_UNIT_RE = /\s*((?:지하)?\d+(?:[,~-]\d+)*\s*층|\d+\s*호)\s*$/;

export function extractFloorDetail(address: string): string {
  const parts: string[] = [];
  let rest = address.trim();
  let match = rest.match(FLOOR_UNIT_RE);
  while (match) {
    parts.unshift(match[1].trim());
    rest = rest.slice(0, match.index).trim();
    match = rest.match(FLOOR_UNIT_RE);
  }
  return parts.join(' ');
}
