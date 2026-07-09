/**
 * Per-track line icons (stroke-based, drawn for viewBox "0 0 48 48", decorative).
 * Shared by the Learn hub TrackCard and the roadmap header so both surfaces
 * render the same mark for a track. Inherit the SVG stroke color.
 */
export const trackIcons: Record<string, string> = {
  // Terminal
  linux: '<rect x="6" y="10" width="36" height="28" rx="3"/><path d="M14 22l5 4-5 4"/><path d="M26 31h8"/>',
  // Container stack + waterline
  docker: '<rect x="13" y="23" width="7" height="7" rx="1"/><rect x="22" y="23" width="7" height="7" rx="1"/><rect x="31" y="23" width="7" height="7" rx="1"/><rect x="17.5" y="15" width="7" height="7" rx="1"/><rect x="26.5" y="15" width="7" height="7" rx="1"/><path d="M7 32c3 3 7 3 9.5 0 2.5 3 6.5 3 9 0 2.5 3 6.5 3 9 0 1.8 1.8 4 1.8 5.5 0"/>',
  // Helm wheel
  kubernetes: '<circle cx="24" cy="24" r="13"/><circle cx="24" cy="24" r="4.5"/><path d="M24 24V11M24 24l11.3-6.5M24 24l11.3 6.5M24 24v13M24 24l-11.3 6.5M24 24l-11.3-6.5"/>',
  // Cloud
  aws: '<path d="M15 33h18a6.5 6.5 0 0 0 .8-13A9 9 0 0 0 16.4 17 6.5 6.5 0 0 0 15 33z"/>',
  // Hub & spoke nodes
  networking: '<circle cx="24" cy="24" r="4"/><circle cx="11" cy="13" r="3.5"/><circle cx="37" cy="13" r="3.5"/><circle cx="11" cy="35" r="3.5"/><circle cx="37" cy="35" r="3.5"/><path d="M21.2 21.2 13.5 15.5M26.8 21.2 34.5 15.5M21.2 26.8 13.5 32.5M26.8 26.8 34.5 32.5"/>',
  // Rocket
  projects: '<path d="M24 6c5 4.5 8 10.5 8 17.5 0 3-.7 5.8-1.8 8.2H17.8A19 19 0 0 1 16 23.5C16 16.5 19 10.5 24 6z"/><circle cx="24" cy="19" r="3"/><path d="M16.2 31.5 11.5 35l1-6.4M31.8 31.5 36.5 35l-1-6.4M20.5 38.5 24 43l3.5-4.5"/>',
  // Layered path (master DevOps roadmap)
  devops: '<path d="M24 6 8 14l16 8 16-8-16-8z"/><path d="M8 24l16 8 16-8"/><path d="M8 34l16 8 16-8"/>',
  // Planted mission flag (guided 90-day program)
  'mission-90': '<path d="M15 42V7"/><path d="M15 9h19l-5 6 5 6H15z"/>',
};

export function trackIcon(slug: string): string {
  return trackIcons[slug] ?? '';
}
