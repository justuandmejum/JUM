// The prototype's copy embeds cross-links as onclick handlers that swapped
// a visible <div> in its single-page design (e.g. legal('refund')) — here
// each policy is a real route, so rewrite those into real links whenever
// rendering such copy via dangerouslySetInnerHTML. Opens in a new tab so
// checking a policy doesn't lose an in-progress form.
export function legalLinksToRealRoutes(html: string): string {
  return html.replace(
    /href="#"\s+onclick="event\.preventDefault\(\);(?:event\.stopPropagation\(\);)?legal\('(\w+)'\)"/g,
    'href="/legal/$1" target="_blank" rel="noopener noreferrer"'
  );
}
