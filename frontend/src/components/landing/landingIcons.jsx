import { Link } from "react-router";

// Decorative 16×16 line icons from the design. Labels come from the surrounding text.
function Icon({ size = 16, strokeWidth = 1.8, children }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const ArrowRightIcon = () => (
  <Icon>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Icon>
);

export const CheckIcon = ({ size = 12, strokeWidth = 2.2 }) => (
  <Icon size={size} strokeWidth={strokeWidth}>
    <path d="M3.5 8.5l3 3 6-7" />
  </Icon>
);

export const PlusIcon = () => (
  <Icon size={14}>
    <path d="M8 3v10M3 8h10" />
  </Icon>
);

// A router link built from a useLandingLinks() entry; the entry's label, if any, replaces
// the design's default text.
export function LandingLink({ link, className, children }) {
  return (
    <Link to={link.to} state={link.state} className={className}>
      {link.label ?? children}
    </Link>
  );
}
