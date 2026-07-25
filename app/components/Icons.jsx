'use client';

// Bộ icon SVG dùng chung, thay cho emoji (theo yêu cầu skill minimalist-ui:
// "không dùng emoji, thay bằng icon/SVG sạch"). Mỗi icon dùng currentColor
// nên tự đổi màu theo chữ xung quanh — không cần truyền màu riêng.
// size mặc định 16, có thể truyền size/className/style khi dùng.

const base = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };

function Svg({ size = 16, children, style, ...rest }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0, ...style }} {...rest}>
      {children}
    </svg>
  );
}

export const CheckIcon = (p) => (
  <Svg {...p}><path {...base} d="M4 12.5 9.5 18 20 6" /></Svg>
);

export const AlertIcon = (p) => (
  <Svg {...p}><path {...base} d="M12 3 22 20H2L12 3Z" /><path {...base} d="M12 9.5v4.5" /><circle cx="12" cy="17.2" r="0.9" fill="currentColor" stroke="none" /></Svg>
);

export const PackageIcon = (p) => (
  <Svg {...p}><path {...base} d="M3.5 7.5 12 3l8.5 4.5v9L12 21l-8.5-4.5v-9Z" /><path {...base} d="M3.7 7.7 12 12l8.3-4.3M12 12v9" /></Svg>
);

export const CartIcon = (p) => (
  <Svg {...p}><path {...base} d="M3 4h2l2.2 11.2a1.5 1.5 0 0 0 1.5 1.3h7.6a1.5 1.5 0 0 0 1.5-1.2L19.5 8H6" /><circle cx="9.5" cy="20" r="1.1" fill="currentColor" stroke="none" /><circle cx="16.5" cy="20" r="1.1" fill="currentColor" stroke="none" /></Svg>
);

export const ChatIcon = (p) => (
  <Svg {...p}><path {...base} d="M4 5.5h16v10.5H9l-4 3.5V16H4Z" /></Svg>
);

export const TrashIcon = (p) => (
  <Svg {...p}><path {...base} d="M5 7h14M9.5 7V5a1.5 1.5 0 0 1 1.5-1.5h2A1.5 1.5 0 0 1 14.5 5v2M6.5 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h6.4a1.5 1.5 0 0 0 1.5-1.4l.8-12" /></Svg>
);

export const StarIcon = (p) => (
  <Svg {...p}><path {...base} d="M12 3.3 14.9 9.2 21.3 10.1 16.7 14.6 17.8 21 12 17.9 6.2 21 7.3 14.6 2.7 10.1 9.1 9.2Z" /></Svg>
);

export const ImageIcon = (p) => (
  <Svg {...p}><rect x="3.5" y="4.5" width="17" height="15" rx="1.5" {...base} /><circle cx="9" cy="10" r="1.6" {...base} /><path {...base} d="m5 17 4.5-4.5L13 16l3-3 3 3" /></Svg>
);

export const BellIcon = (p) => (
  <Svg {...p}><path {...base} d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 1.5 5.5H4.5S6 14 6 10Z" /><path {...base} d="M10 19a2 2 0 0 0 4 0" /></Svg>
);

export const CloseIcon = (p) => (
  <Svg {...p}><path {...base} d="M6 6l12 12M18 6 6 18" /></Svg>
);

export const UndoIcon = (p) => (
  <Svg {...p}><path {...base} d="M8 7 4 11l4 4" /><path {...base} d="M4 11h11a5 5 0 0 1 0 10h-2" /></Svg>
);

export const SunIcon = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="4.2" {...base} /><path {...base} d="M12 2.5v2.4M12 19.1v2.4M4.4 4.4l1.7 1.7M17.9 17.9l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.4 19.6l1.7-1.7M17.9 6.1l1.7-1.7" /></Svg>
);

export const MoonIcon = (p) => (
  <Svg {...p}><path {...base} d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" /></Svg>
);

export const LockIcon = (p) => (
  <Svg {...p}><rect x="5" y="10.5" width="14" height="9.5" rx="1.5" {...base} /><path {...base} d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></Svg>
);

export const MailIcon = (p) => (
  <Svg {...p}><rect x="3.5" y="5.5" width="17" height="13" rx="1.5" {...base} /><path {...base} d="m4.5 7 7.5 6 7.5-6" /></Svg>
);

export const ArrowLeftIcon = (p) => (
  <Svg {...p}><path {...base} d="M19 12H6M11 6l-6 6 6 6" /></Svg>
);

export const ArrowRightIcon = (p) => (
  <Svg {...p}><path {...base} d="M5 12h13M13 6l6 6-6 6" /></Svg>
);

export const ExternalLinkIcon = (p) => (
  <Svg {...p}><path {...base} d="M9 6H6.5A1.5 1.5 0 0 0 5 7.5v10A1.5 1.5 0 0 0 6.5 19h10a1.5 1.5 0 0 0 1.5-1.5V15" /><path {...base} d="M13 5h6v6M18.5 5.5 10 14" /></Svg>
);

export const TagIcon = (p) => (
  <Svg {...p}><path {...base} d="M12.5 4H6a1.5 1.5 0 0 0-1.5 1.5V12l9 9 8-8-9-9Z" /><circle cx="9" cy="9" r="1.1" fill="currentColor" stroke="none" /></Svg>
);

export const FolderIcon = (p) => (
  <Svg {...p}><path {...base} d="M4 6.5h5l2 2.2h9V18a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18Z" /></Svg>
);

export const ShieldIcon = (p) => (
  <Svg {...p}><path {...base} d="M12 3.5 19 6v6c0 5-3 7.7-7 9-4-1.3-7-4-7-9V6Z" /><path {...base} d="m9.2 12 1.9 1.9L15 9.9" /></Svg>
);

export const ChainIcon = (p) => (
  <Svg {...p}><path {...base} d="M9.5 14.5 14.5 9.5" /><path {...base} d="M11 7.5 13 5.4a3.2 3.2 0 0 1 4.6 4.5L15.5 12" /><path {...base} d="M13 16.5 11 18.6a3.2 3.2 0 0 1-4.6-4.5L8.5 12" /></Svg>
);

export const CoinIcon = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" {...base} /><path {...base} d="M12 7.5v9M9.5 9.7c0-1.1 1-1.9 2.5-1.9s2.6.9 2.6 2c0 2.5-5.1 1.4-5.1 3.9 0 1.1 1.1 2 2.6 2s2.6-.8 2.6-1.9" /></Svg>
);

export const CameraIcon = (p) => (
  <Svg {...p}><path {...base} d="M4 8.5h3l1.3-2h7.4l1.3 2h3V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" /><circle cx="12" cy="13" r="3.3" {...base} /></Svg>
);

export const InboxIcon = (p) => (
  <Svg {...p}><path {...base} d="M4 12h4.5l1.5 2.5h4L15.5 12H20" /><path {...base} d="m4 12 2-7.5h12L20 12v6a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 18Z" /></Svg>
);

export const CelebrateIcon = (p) => (
  <Svg {...p}><path {...base} d="M5 19 15.5 8.5" /><path {...base} d="m11 5 1 2M16 4l.6 2.3M19 8l2 .8M6 15l-2.3.6M5 20h.01" /><circle cx="18" cy="14" r="1" fill="currentColor" stroke="none" /></Svg>
);

export const SearchIcon = (p) => (
  <Svg {...p}><circle cx="10.5" cy="10.5" r="6" {...base} /><path {...base} d="m19 19-4-4" /></Svg>
);

export const InfoIcon = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" {...base} /><path {...base} d="M12 11v5.5" /><circle cx="12" cy="7.8" r="0.9" fill="currentColor" stroke="none" /></Svg>
);

export const ClockIcon = (p) => (
  <Svg {...p}><circle cx="12" cy="12" r="8.5" {...base} /><path {...base} d="M12 7.5V12l3.2 2" /></Svg>
);

export const FlaskIcon = (p) => (
  <Svg {...p}><path {...base} d="M10 3.5h4M10.5 4v6.5L5.5 18a2 2 0 0 0 1.7 3h9.6a2 2 0 0 0 1.7-3l-5-7.5V4" /></Svg>
);
