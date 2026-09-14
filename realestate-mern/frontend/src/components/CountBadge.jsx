const VARIANTS = {
  brass: "bg-brass text-navy",
  brick: "bg-brick text-ivory",
};

const CountBadge = ({ count, variant = "brass" }) => {
  if (!count) return null;

  return (
    <span
      className={`flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold leading-none ${VARIANTS[variant]}`}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
};

export default CountBadge;