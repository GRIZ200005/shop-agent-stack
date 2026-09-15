import { useEffect, useRef, useState, type ReactNode } from "react";
import { X, PackageOpen, LoaderCircle } from "lucide-react";
export function Empty({
  title,
  children,
}: {
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="empty">
      <PackageOpen size={34} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Loading() {
  return (
    <div className="empty" role="status">
      <LoaderCircle className="spin" />
      正在加载…
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current!;
    d.showModal();
    const close = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    d.addEventListener("cancel", close);
    return () => {
      d.removeEventListener("cancel", close);
      d.close();
    };
  }, [onClose]);
  return (
    <dialog ref={ref} className="modal" aria-label={title}>
      <div className="modal-title">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="关闭">
          <X />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function ProductArt({
  id = 1,
  large = false,
  src,
  alt = "商品图片",
}: {
  id?: number;
  large?: boolean;
  src?: string;
  alt?: string;
}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (src && !failed)
    return (
      <div className={`product-art product-photo ${large ? "large" : ""}`}>
        <img
          src={src}
          alt={alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
        />
      </div>
    );
  if (![1, 101, 102, 103].includes(id))
    return (
      <div
        className="product-art product-photo product-photo-empty"
        role="img"
        aria-label={`${alt}暂不可用`}
      >
        <PackageOpen size={36} />
        <span>图片暂不可用</span>
      </div>
    );
  const kind =
    id === 1
      ? "cable"
      : id === 101
        ? "hub"
        : id === 102
          ? "headphones"
          : "speaker";
  return (
    <div
      className={`product-art ${kind} ${large ? "large" : ""}`}
      aria-hidden="true"
    >
      <svg viewBox="0 0 320 220">
        <ellipse
          cx="166"
          cy="193"
          rx="83"
          ry="9"
          fill="#172139"
          opacity=".09"
        />
        {kind === "cable" ? (
          <g
            fill="none"
            stroke="#3e4562"
            strokeWidth="13"
            strokeLinecap="round"
          >
            <path d="M107 59v22c0 24 96 19 96 55 0 49-107 48-107 6 0-38 104-37 104-69V51" />
            <path d="M107 35v28M200 25v27" stroke="#bdc2d3" strokeWidth="20" />
            <path d="M107 28v9M200 18v9" stroke="#545d79" strokeWidth="12" />
          </g>
        ) : kind === "hub" ? (
          <g transform="rotate(-18 160 120)">
            <path
              d="M230 101c61-3 17-67 59-69"
              fill="none"
              stroke="#59616e"
              strokeWidth="7"
            />
            <rect
              x="65"
              y="78"
              width="177"
              height="85"
              rx="18"
              fill="#6b788b"
            />
            <rect
              x="65"
              y="69"
              width="177"
              height="82"
              rx="18"
              fill="#cdd3dd"
            />
            <rect x="80" y="130" width="31" height="9" rx="2" fill="#39445b" />
            <rect x="122" y="130" width="31" height="9" rx="2" fill="#39445b" />
            <rect x="170" y="130" width="48" height="7" rx="2" fill="#39445b" />
            <text
              x="151"
              y="110"
              textAnchor="middle"
              fill="#77849b"
              fontSize="12"
              letterSpacing="4"
            >
              ASTER
            </text>
          </g>
        ) : kind === "headphones" ? (
          <g fill="none" strokeLinecap="round">
            <path
              d="M92 130V98c0-81 136-81 136 0v32"
              stroke="#515b53"
              strokeWidth="20"
            />
            <path
              d="M101 81c13-47 106-47 118 0"
              stroke="#adb8a2"
              strokeWidth="16"
            />
            <rect
              x="71"
              y="105"
              width="45"
              height="76"
              rx="20"
              fill="#81927a"
            />
            <rect
              x="206"
              y="105"
              width="45"
              height="76"
              rx="20"
              fill="#81927a"
            />
            <path d="M107 115v53M214 115v53" stroke="#c3cbb8" strokeWidth="9" />
          </g>
        ) : (
          <g>
            <rect
              x="111"
              y="41"
              width="99"
              height="147"
              rx="37"
              fill="#d4b39a"
            />
            <rect
              x="119"
              y="48"
              width="83"
              height="129"
              rx="30"
              fill="#dfc7b1"
            />
            {Array.from({ length: 12 }, (_, i) => (
              <path
                key={i}
                d={`M129 ${71 + i * 7}h63`}
                stroke="#be9a7e"
                strokeWidth="2"
                opacity=".7"
              />
            ))}
            <circle cx="160" cy="56" r="4" fill="#f9ede2" />
          </g>
        )}
      </svg>
    </div>
  );
}
