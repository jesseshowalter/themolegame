interface Props {
  size?: number;
}

/** Glowing italic "THE MOLE" wordmark from the Figma header. */
export default function Wordmark({ size = 64 }: Props) {
  return (
    <h1 className="wordmark" style={{ fontSize: size }}>
      THE MOLE
    </h1>
  );
}
