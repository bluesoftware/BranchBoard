/** Small inline SVG icon set — no external assets, inherits currentColor. */
import type { CSSProperties } from "react";

interface IconProps {
  size?: number;
  style?: CSSProperties;
}

export function BranchIcon({ size = 12, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M11.75 2.5a.75.75 0 100 1.5.75.75 0 000-1.5zm-2.25.75a2.25 2.25 0 113 2.122V6A2.5 2.5 0 0110 8.5H6a1 1 0 00-1 1v1.128a2.251 2.251 0 11-1.5 0V5.372a2.25 2.25 0 111.5 0v1.836A2.492 2.492 0 016 7h4a1 1 0 001-1v-.628A2.25 2.25 0 019.5 3.25zM4.25 12a.75.75 0 100 1.5.75.75 0 000-1.5zM3.5 3.25a.75.75 0 111.5 0 .75.75 0 01-1.5 0z" />
    </svg>
  );
}

export function CommentIcon({ size = 12, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M2 3a1 1 0 011-1h10a1 1 0 011 1v7a1 1 0 01-1 1H6l-3 3v-3H3a1 1 0 01-1-1V3z" />
    </svg>
  );
}

export function SearchIcon({ size = 13, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M6.5 1a5.5 5.5 0 014.38 8.82l3.65 3.65a.75.75 0 01-1.06 1.06l-3.65-3.65A5.5 5.5 0 116.5 1zm0 1.5a4 4 0 100 8 4 4 0 000-8z" />
    </svg>
  );
}

export function GearIcon({ size = 14, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M8 5.5A2.5 2.5 0 108 10.5 2.5 2.5 0 008 5.5zm0 1.5a1 1 0 110 2 1 1 0 010-2z" />
      <path d="M6.94 1l-.36 1.52a4.9 4.9 0 00-1.1.64L3.99 2.6l-1.5 1.5.56 1.49a4.9 4.9 0 00-.64 1.1L.9 7.06v2.12l1.52.36c.16.39.37.76.64 1.1L2.5 12.13l1.5 1.5 1.49-.56c.34.27.71.48 1.1.64l.36 1.52h2.12l.36-1.52c.39-.16.76-.37 1.1-.64l1.49.56 1.5-1.5-.56-1.49c.27-.34.48-.71.64-1.1L15.1 9.18V7.06l-1.52-.36a4.9 4.9 0 00-.64-1.1l.56-1.49-1.5-1.5-1.49.56a4.9 4.9 0 00-1.1-.64L9.06 1H6.94z" />
    </svg>
  );
}

export function RefreshIcon({ size = 13, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M8 3V1L5 3.5 8 6V4a4 4 0 11-3.9 5h-1.6A5.5 5.5 0 108 2.5z" />
    </svg>
  );
}

export function CheckoutIcon({ size = 13, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M8 1.5a.75.75 0 01.75.75v6.19l2.22-2.22a.75.75 0 111.06 1.06l-3.5 3.5a.75.75 0 01-1.06 0l-3.5-3.5a.75.75 0 111.06-1.06L7.25 8.44V2.25A.75.75 0 018 1.5z" />
      <path d="M2.75 12.5a.75.75 0 000 1.5h10.5a.75.75 0 000-1.5H2.75z" />
    </svg>
  );
}

export function PushIcon({ size = 13, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M8 14.5a.75.75 0 01-.75-.75V7.56L5.03 9.78a.75.75 0 11-1.06-1.06l3.5-3.5a.75.75 0 011.06 0l3.5 3.5a.75.75 0 11-1.06 1.06L8.75 7.56v6.19A.75.75 0 018 14.5z" />
      <path d="M2.75 2a.75.75 0 000 1.5h10.5a.75.75 0 000-1.5H2.75z" />
    </svg>
  );
}

export function FinishIcon({ size = 13, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M6.5 10.6L3.9 8l-1 1 3.6 3.6L14 4.1l-1-1z" />
    </svg>
  );
}

export function SparkleIcon({ size = 13, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M8 1l1.4 3.6L13 6l-3.6 1.4L8 11 6.6 7.4 3 6l3.6-1.4L8 1zM13 9l.7 1.8L15.5 11.5l-1.8.7L13 14l-.7-1.8-1.8-.7 1.8-.7L13 9z" />
    </svg>
  );
}

export function CopyIcon({ size = 13, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M4 2a2 2 0 00-2 2v6h1.5V4a.5.5 0 01.5-.5h6V2H4z" />
      <path d="M6 5a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V6a1 1 0 00-1-1H6zm.5 1.5h6v6h-6v-6z" />
    </svg>
  );
}

export function FileIcon({ size = 12, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M4 1.5h5L13 5.5V14a.5.5 0 01-.5.5h-9A.5.5 0 013 14V2a.5.5 0 01.5-.5H4zm5 1.2V5.5h2.8L9 2.7zM4.5 3v10.5h7.5V6.7H8.3a.8.8 0 01-.8-.8V3H4.5z" />
    </svg>
  );
}

export function FolderIcon({ size = 12, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M1.5 3.5A1 1 0 012.5 2.5h3.06a1 1 0 01.7.3l1.2 1.2H13.5a1 1 0 011 1V13a1 1 0 01-1 1h-11a1 1 0 01-1-1V3.5zm1.5.5v8h10V6.4H7.06a1 1 0 01-.7-.29l-1.2-1.2H3v.09z" />
    </svg>
  );
}

export function CalendarIcon({ size = 12, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M5 1.5a.6.6 0 011.2 0V2h3.6v-.5a.6.6 0 011.2 0V2H13a1 1 0 011 1v9a1 1 0 01-1 1H3a1 1 0 01-1-1V3a1 1 0 011-1h.8v-.5zM3.2 5.5V11.8h9.6V5.5H3.2z" />
    </svg>
  );
}

export function BellIcon({ size = 14, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M8 1.25a.75.75 0 01.75.75v.56A4.5 4.5 0 0112.5 7v2.94l1.27 1.9a.75.75 0 01-.62 1.16H2.85a.75.75 0 01-.62-1.16L3.5 9.94V7a4.5 4.5 0 013.75-4.44V2A.75.75 0 018 1.25zM6.2 13.5a1.8 1.8 0 003.6 0H6.2z" />
    </svg>
  );
}

export function SendIcon({ size = 14, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M1.6 1.4a.7.7 0 01.86-.2l12.4 5.9a.7.7 0 010 1.26L2.46 14.3a.7.7 0 01-.97-.78l1.5-5.02-1.5-5.02a.7.7 0 01.11-1.08zM4.5 8l-1.1 3.7L12.6 7 3.4 2.3 4.5 6H10v2H4.5z" />
    </svg>
  );
}

export function ChevronDownIcon({ size = 11, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M3.7 5.6a.75.75 0 011.06.04L8 8.97l3.24-3.33a.75.75 0 111.08 1.04l-3.77 3.88a.75.75 0 01-1.08 0L3.7 6.68a.75.75 0 010-1.08z" />
    </svg>
  );
}

export function CloseIcon({ size = 12, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M3.3 3.3a.9.9 0 011.27 0L8 6.74l3.43-3.44a.9.9 0 111.27 1.27L9.27 8l3.43 3.43a.9.9 0 01-1.27 1.27L8 9.26l-3.43 3.44a.9.9 0 01-1.27-1.27L6.73 8 3.3 4.57a.9.9 0 010-1.27z" />
    </svg>
  );
}

export function AttachIcon({ size = 13, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="currentColor" style={style} aria-hidden="true">
      <path d="M11.1 2.3a2.6 2.6 0 013.7 3.7l-5.9 5.9a4 4 0 01-5.66-5.66l5.3-5.3a.75.75 0 111.06 1.06l-5.3 5.3a2.5 2.5 0 003.54 3.54l5.9-5.9a1.1 1.1 0 00-1.56-1.56l-5.4 5.4a.6.6 0 11-.85-.85l5.4-5.4.77-.23z" />
    </svg>
  );
}

export function LogoMark({ size = 18, style }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" style={style} aria-hidden="true">
      <circle cx="6" cy="6" r="2.4" />
      <circle cx="6" cy="18" r="2.4" />
      <circle cx="18" cy="9" r="2.4" />
      <path d="M6 8.4v7.2M8.3 6.6h4.2a3 3 0 013 3v0M15.6 9h0" />
      <rect x="14" y="14" width="6" height="6" rx="1.4" />
    </svg>
  );
}
