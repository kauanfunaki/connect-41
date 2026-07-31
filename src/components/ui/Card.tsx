type Props = {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section";
};

export function Card({ children, className = "", as: As = "div" }: Props) {
  return (
    <As className={`bg-surface border border-border rounded-lg ${className}`.trim()}>
      {children}
    </As>
  );
}
