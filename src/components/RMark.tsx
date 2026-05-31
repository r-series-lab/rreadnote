type RMarkProps = {
  className?: string;
};

export function RMark({ className }: RMarkProps) {
  return (
    <div className={["brand-mark", className].filter(Boolean).join(" ")} aria-hidden="true">
      <svg viewBox="0 0 132 164" className="brand-mark-svg">
        <path
          fill="currentColor"
          d="M18 16H70C101 16 120 34 120 63C120 88 107 104 85 112L119 160H87L58 118H47V160L18 184V16ZM47 42V91H69C84 91 92 82 92 67C92 50 84 42 69 42H47Z"
        />
      </svg>
    </div>
  );
}
