// Single-source icon set. 16px stroke icons on a 24 grid, inherits currentColor.

const S = ({ children, size = 16, fill = 'none', ...rest }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={fill}
    stroke="currentColor"
    strokeWidth="1.9"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    {...rest}
  >
    {children}
  </svg>
);

export const IconDashboard = (p) => (
  <S {...p}><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></S>
);
export const IconInbox = (p) => (
  <S {...p}><path d="M3 12l2.5-7A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.9 1.3L21 12v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M3 12h5l1.5 2.5h5L16 12h5" /></S>
);
export const IconOrders = (p) => (
  <S {...p}><path d="M8 3h8a1 1 0 0 1 1 1v1h2a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h2V4a1 1 0 0 1 1-1z" /><path d="M9 11h6M9 15h4" /></S>
);
export const IconCalculator = (p) => (
  <S {...p}><rect x="4" y="2.5" width="16" height="19" rx="2" /><path d="M8 7h8M8 12h.01M12 12h.01M16 12h.01M8 16.5h.01M12 16.5h.01M16 16.5h.01" /></S>
);
export const IconTag = (p) => (
  <S {...p}><path d="M20.6 13.1l-7.5 7.5a2 2 0 0 1-2.9 0l-7-7A2 2 0 0 1 2.6 12V4.6A2 2 0 0 1 4.6 2.6H12a2 2 0 0 1 1.4.6l7.2 7.1a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.4" /></S>
);
export const IconDoc = (p) => (
  <S {...p}><path d="M14 2.5H7a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7.5z" /><path d="M14 2.5v5h5M9 13h6M9 17h4" /></S>
);
export const IconCheckCircle = (p) => (
  <S {...p}><circle cx="12" cy="12" r="9.2" /><path d="M8.2 12.4l2.6 2.6 5-5.4" /></S>
);
export const IconXCircle = (p) => (
  <S {...p}><circle cx="12" cy="12" r="9.2" /><path d="M15 9l-6 6M9 9l6 6" /></S>
);
export const IconBox = (p) => (
  <S {...p}><path d="M21 8.4v7.2a2 2 0 0 1-1 1.7l-7 3.9a2 2 0 0 1-2 0l-7-3.9a2 2 0 0 1-1-1.7V8.4a2 2 0 0 1 1-1.7l7-3.9a2 2 0 0 1 2 0l7 3.9a2 2 0 0 1 1 1.7z" /><path d="M3.4 7.3L12 12l8.6-4.7M12 21.4V12" /></S>
);
export const IconFactory = (p) => (
  <S {...p}><path d="M3 21h18M4 21V10l5 3.5V10l5 3.5V8l5 3.5V21" /><path d="M4 10V5.5a.5.5 0 0 1 .8-.4L7 6.6" /><path d="M9 17h1.5M14 17h1.5" /></S>
);
export const IconShield = (p) => (
  <S {...p}><path d="M12 2.6l7.5 3v5.8c0 4.8-3.1 8.7-7.5 10.1-4.4-1.4-7.5-5.3-7.5-10.1V5.6z" /><path d="M8.8 12.2l2.3 2.3 4.1-4.4" /></S>
);
export const IconTruck = (p) => (
  <S {...p}><path d="M2 6.5h11v10H2zM13 10h4.4a2 2 0 0 1 1.7 1l2 3.3v2.2H13z" /><circle cx="6.5" cy="18.5" r="1.9" /><circle cx="17" cy="18.5" r="1.9" /></S>
);
export const IconReceipt = (p) => (
  <S {...p}><path d="M5 2.5h14v19l-3.5-2-3.5 2-3.5-2L5 21.5z" /><path d="M9 8h6M9 12h6M9 16h3" /></S>
);
export const IconRupee = (p) => (
  <S {...p}><path d="M7 4h10M7 9h10M15.5 4c0 3.6-2.4 5-5.5 5H7l8 11" /></S>
);
export const IconGate = (p) => (
  <S {...p}><path d="M3 21V7l9-4 9 4v14" /><path d="M3 21h18M9 21v-6h6v6M12 3v4" /></S>
);
export const IconChart = (p) => (
  <S {...p}><path d="M3 3v18h18" /><path d="M7 15l3.5-4.5 3 2.5L20 6" /></S>
);
export const IconUsers = (p) => (
  <S {...p}><path d="M16 20v-1.6a3.4 3.4 0 0 0-3.4-3.4H6.4A3.4 3.4 0 0 0 3 18.4V20" /><circle cx="9.5" cy="7.5" r="3.6" /><path d="M21 20v-1.6a3.4 3.4 0 0 0-2.6-3.3M15.5 4.1a3.6 3.6 0 0 1 0 6.9" /></S>
);
export const IconSettings = (p) => (
  <S {...p}><circle cx="12" cy="12" r="3.1" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2v.3a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H2.8a2 2 0 1 1 0-4H3a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V2.8a2 2 0 1 1 4 0V3a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.5 1H22a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1z" /></S>
);
export const IconCart = (p) => (
  <S {...p}><circle cx="9" cy="20" r="1.6" /><circle cx="18" cy="20" r="1.6" /><path d="M2 2.5h2.5l2.6 12.1a1.6 1.6 0 0 0 1.6 1.3h9.1a1.6 1.6 0 0 0 1.6-1.3L21 7H5.4" /></S>
);
export const IconWarehouse = (p) => (
  <S {...p}><path d="M2 21V8.2a1 1 0 0 1 .6-.9l9-3.9a1 1 0 0 1 .8 0l9 3.9a1 1 0 0 1 .6.9V21" /><path d="M2 21h20M7 21v-7h10v7M7 17.5h10" /></S>
);
export const IconSearch = (p) => (
  <S {...p}><circle cx="10.5" cy="10.5" r="6.5" /><path d="M20 20l-4.9-4.9" /></S>
);
export const IconPlus = (p) => <S {...p}><path d="M12 5v14M5 12h14" /></S>;
export const IconX = (p) => <S {...p}><path d="M18 6L6 18M6 6l12 12" /></S>;
export const IconChevronRight = (p) => <S {...p}><path d="M9 5l7 7-7 7" /></S>;
export const IconChevronLeft = (p) => <S {...p}><path d="M15 5l-7 7 7 7" /></S>;
export const IconChevronDown = (p) => <S {...p}><path d="M5 9l7 7 7-7" /></S>;
export const IconArrowRight = (p) => <S {...p}><path d="M4 12h16M14 6l6 6-6 6" /></S>;
export const IconArrowLeft = (p) => <S {...p}><path d="M20 12H4M10 6l-6 6 6 6" /></S>;
export const IconEdit = (p) => (
  <S {...p}><path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6" /><path d="M18.4 2.6a2 2 0 0 1 2.9 2.8L12 15l-4 1 1-4z" /></S>
);
export const IconPrint = (p) => (
  <S {...p}><path d="M6 9V3h12v6M6 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-1" /><rect x="6" y="14" width="12" height="7" rx="1" /></S>
);
export const IconDownload = (p) => (
  <S {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></S>
);
export const IconAlert = (p) => (
  <S {...p}><path d="M10.3 3.6L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z" /><path d="M12 9v4M12 17h.01" /></S>
);
export const IconInfo = (p) => (
  <S {...p}><circle cx="12" cy="12" r="9.2" /><path d="M12 16v-5M12 8h.01" /></S>
);
export const IconClock = (p) => (
  <S {...p}><circle cx="12" cy="12" r="9.2" /><path d="M12 7.2V12l3.3 2" /></S>
);
export const IconLock = (p) => (
  <S {...p}><rect x="4" y="10.5" width="16" height="11" rx="2" /><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" /></S>
);
export const IconMenu = (p) => <S {...p}><path d="M3 6h18M3 12h18M3 18h18" /></S>;
export const IconPanelLeft = (p) => (
  <S {...p}><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9.5 3v18" /></S>
);
export const IconLogout = (p) => (
  <S {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></S>
);
export const IconSun = (p) => (
  <S {...p}><circle cx="12" cy="12" r="4.2" /><path d="M12 1.8v2.4M12 19.8v2.4M4.6 4.6l1.7 1.7M17.7 17.7l1.7 1.7M1.8 12h2.4M19.8 12h2.4M4.6 19.4l1.7-1.7M17.7 6.3l1.7-1.7" /></S>
);
export const IconMoon = (p) => <S {...p}><path d="M20.5 14.5A8.6 8.6 0 0 1 9.5 3.5a8.6 8.6 0 1 0 11 11z" /></S>;
export const IconRefresh = (p) => (
  <S {...p}><path d="M20.5 11a8.5 8.5 0 0 0-14.6-4.6L2.5 9.5" /><path d="M2.5 4.5v5h5" /><path d="M3.5 13a8.5 8.5 0 0 0 14.6 4.6l3.4-3.1" /><path d="M21.5 19.5v-5h-5" /></S>
);
export const IconFilter = (p) => <S {...p}><path d="M3 5h18l-7 8.5V21l-4-2.5v-5z" /></S>;
export const IconEye = (p) => (
  <S {...p}><path d="M1.8 12S5.5 5 12 5s10.2 7 10.2 7-3.7 7-10.2 7S1.8 12 1.8 12z" /><circle cx="12" cy="12" r="3.1" /></S>
);
export const IconEyeOff = (p) => (
  <S {...p}><path d="M3 3l18 18M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10.2 7 10.2 7a17.6 17.6 0 0 1-3.2 4.1M6.5 6.6C3.9 8.3 1.8 12 1.8 12s3.7 7 10.2 7a10 10 0 0 0 3.4-.6" /><path d="M9.5 10a3.1 3.1 0 0 0 4.3 4.4" /></S>
);
export const IconHistory = (p) => (
  <S {...p}><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3 9" /><path d="M3 4v5h5M12 7.5V12l3.5 2" /></S>
);
export const IconPause = (p) => <S {...p}><rect x="6.5" y="4.5" width="4" height="15" rx="1" /><rect x="13.5" y="4.5" width="4" height="15" rx="1" /></S>;
export const IconPlay = (p) => <S {...p}><path d="M6.5 4.3l13 7.7-13 7.7z" /></S>;
export const IconKey = (p) => (
  <S {...p}><circle cx="7.5" cy="15.5" r="4" /><path d="M10.4 12.6L20 3M16.5 6.5l2.5 2.5M14 9l2.5 2.5" /></S>
);
export const IconLayers = (p) => (
  <S {...p}><path d="M12 2.5l9.5 5-9.5 5-9.5-5z" /><path d="M2.5 12.5l9.5 5 9.5-5M2.5 17l9.5 5 9.5-5" /></S>
);
