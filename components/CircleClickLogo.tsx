type CircleClickLogoProps = {
  className?: string;
  title?: string;
};

export function CircleClickLogo({ className, title }: CircleClickLogoProps) {
  return (
    <svg
      aria-hidden={title ? undefined : "true"}
      aria-label={title}
      className={className}
      fill="none"
      focusable="false"
      role={title ? "img" : undefined}
      viewBox="0 0 86 80"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        clipRule="evenodd"
        d="M64.41 56.48l8.2 4.76a37.5 37.5 0 0 1-41.866 12.767A37.5 37.5 0 1 1 72.73 15.91l-8.22 4.72a28.13 28.13 0 1 0-.1 35.85z"
        fill="currentColor"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M47.45 46.63l8.68 5a18.75 18.75 0 1 1 .07-26.23l-8.71 5a9.25 9.25 0 0 0-4.68-1.26 9.37 9.37 0 0 0 0 18.74 9.19 9.19 0 0 0 4.64-1.25z"
        fill="currentColor"
        fillRule="evenodd"
      />
      <path
        clipRule="evenodd"
        d="M80.29 38.6a37.43 37.43 0 0 1-3 14.54l-8.2-4.76-8.28-4.81c0-.13.07-.26.1-.39 0 .13-.07.26-.11.38l-8.67-5 8.7-5c0 .13.07.25.1.39a3.691 3.691 0 0 0-.1-.39l8.31-4.77L77.4 24a37.378 37.378 0 0 1 2.89 14.6z"
        fill="currentColor"
        fillRule="evenodd"
      />
    </svg>
  );
}
