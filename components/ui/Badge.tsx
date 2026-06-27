export interface BadgeProps {
  variant?: "default" | "elite";
  children: React.ReactNode;
  className?: string;
}

export default function Badge({ variant = "default", children, className = "" }: BadgeProps) {
  const variants = {
    default: "bg-brand-green text-black",
    elite: "bg-amber-500 text-black border-2 border-amber-300",
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${variants[variant]} ${className}`}>
      {children}
    </span>
  );
}
