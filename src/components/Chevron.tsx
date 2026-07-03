export default function Chevron({ size = 18 }: { size?: number }) {
  return (
    <svg
      className="chevron"
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="square"
      aria-hidden="true"
    >
      <path d="M7 4l7 6-7 6" />
    </svg>
  );
}
