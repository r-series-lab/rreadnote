type InlineIllustrationProps = {
  caption: string;
  variant?: string | null;
  compact?: boolean;
};

function normalizeVariant(variant?: string | null) {
  return variant?.trim() || "editorial";
}

export function InlineIllustration({
  caption,
  variant,
  compact = false,
}: InlineIllustrationProps) {
  const resolvedVariant = normalizeVariant(variant);

  return (
    <figure
      className={`inline-illustration ${compact ? "inline-illustration-compact" : ""} inline-illustration-${resolvedVariant}`}
    >
      <div className="inline-illustration-art">
        <div className="illustration-orb illustration-orb-a" />
        <div className="illustration-orb illustration-orb-b" />
        <div className="illustration-hill illustration-hill-back" />
        <div className="illustration-hill illustration-hill-front" />
        <div className="illustration-line illustration-line-top" />
        <div className="illustration-line illustration-line-bottom" />
      </div>
      <figcaption className="inline-illustration-caption">{caption}</figcaption>
    </figure>
  );
}
