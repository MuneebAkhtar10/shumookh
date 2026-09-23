/**
 * The Shumookh logo mark (the teal/blue petal icon from shumookh.om),
 * shared by the favicon/apple-icon/og-image generators below — all of
 * which render through Satori (next/og), so this has to stay plain JSX
 * (no external <img>, no CSS classes) for it to rasterize correctly.
 */
export function ShumookhMark({ size = 32 }: { size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 150 127"
    >
      <defs>
        <linearGradient id="a" x1="40.91" y1="110.22" x2="140.22" y2="110.22" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#cae7ec" />
          <stop offset="1" stopColor="#23abb5" />
        </linearGradient>
        <linearGradient id="b" x1="41.2" y1="23.87" x2="41.2" y2="97.28" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#bfc7e3" />
          <stop offset="1" stopColor="#548bc7" />
        </linearGradient>
        <linearGradient id="c" x1="50" y1="32.95" x2="93.77" y2="85.12" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#bfc7e3" />
          <stop offset="1" stopColor="#4d78bc" />
        </linearGradient>
        <linearGradient id="d" x1="122.27" y1="57.53" x2="84.53" y2="79.32" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#bbe2f5" />
          <stop offset="1" stopColor="#41c1e9" />
        </linearGradient>
        <linearGradient id="e" x1="138.65" y1="74.37" x2="100.08" y2="96.64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#cae7ec" />
          <stop offset="1" stopColor="#23abb5" />
        </linearGradient>
        <linearGradient id="f" x1="45.99" y1="20.18" x2="45.99" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#bfc7e3" />
          <stop offset="1" stopColor="#548bc7" />
        </linearGradient>
        <linearGradient id="g" x1="107.25" y1="35.61" x2="107.25" y2="16.77" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#bfc7e3" />
          <stop offset="1" stopColor="#4d78bc" />
        </linearGradient>
        <linearGradient id="h" x1="140.53" y1="68.15" x2="140.53" y2="53.98" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#bbe2f5" />
          <stop offset="1" stopColor="#41c1e9" />
        </linearGradient>
      </defs>
      <path d="M40.91 104.69s87.65 42.68 98.72 9.89a11.81 11.81 0 00.41-5.78c-1.14-6.4-6.66-19.94-33.39-13.73l-1.32 10.63s18.65-6.21 18.08 4.11a3.72 3.72 0 01-.94 2.6c-8.8 10.04-69.28-2.34-81.56-7.72z" fill="url(#a)" />
      <path d="M81.8 93.47S8.06 121.83.61 23.87a33 33 0 0028.82 8.85c2.26 22.89 12.09 60.75 52.37 60.75z" fill="url(#b)" />
      <path d="M86.21 91.46c-3.76.39-54.82-11.65-22.74-69.82.11.35 3.71 11.43 17.86 16.64-8.45 11.91-15.21 32.55 4.88 53.18z" fill="url(#c)" />
      <path d="M97.43 97.08c-3-.74-34.56-34.22 14-58.29a25.57 25.57 0 005.5 18.21c-10.79 4-23.38 14.59-19.5 40.08z" fill="url(#d)" />
      <path d="M133.45 84.45c-8.91.15-19.93 4.28-28.12 21.24-2.46-3.27-7.57-36 31.9-33.79 0 .01-4.86 3.94-3.78 12.55z" fill="url(#e)" />
      <circle cx="45.99" cy="10.09" r="10.09" fill="url(#f)" />
      <circle cx="107.25" cy="26.19" r="9.42" fill="url(#g)" />
      <circle cx="140.53" cy="61.06" r="7.08" fill="url(#h)" />
      <path d="M29.43 32.72A33 33 0 01.61 23.87a.28.28 0 000-.06C.14 17.62-.07 10.91 0 3.67c12.43 9.22 28.87 12 28.87 12a115.91 115.91 0 00.56 17.05zM91.82 28.13c-2.07.77-6.48 4.47-10.49 10.15C67.18 33.07 63.58 22 63.47 21.64A165.7 165.7 0 0174.18 4.88c3.21 11.22 17.64 23.25 17.64 23.25z" fill="#8289c3" />
      <path d="M128.7 54.58A35.39 35.39 0 00116.93 57a25.57 25.57 0 01-5.48-18.16 128.15 128.15 0 0114-5.84c-3.16 9.56 3.25 21.58 3.25 21.58z" fill="#62bfef" />
      <path d="M145.14 86.25a38.38 38.38 0 00-11.69-1.79c-1.08-8.61 3.78-12.54 3.78-12.54a92.55 92.55 0 0111.91 1.51c-6.69 4.37-4.55 12.57-4 12.82z" fill="#41c0ca" />
    </svg>
  );
}
