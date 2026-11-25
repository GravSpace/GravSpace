import React from 'react'
import * as Iconsax from 'iconsax-react'

export type IconProps = {
  size?: number | string
  color?: string
  variant?: 'Linear' | 'Bold' | 'Broken' | 'Bulk' | 'TwoTone' | 'Outline'
  className?: string
  strokeWidth?: number | string
  style?: React.CSSProperties
  [key: string]: any
}

function wrap(Component: any, defaultVariant: 'Linear' | 'Bold' = 'Linear') {
  if (!Component) {
    return wrap(Iconsax.Category)
  }
  const Icon = React.forwardRef<SVGSVGElement, IconProps>((props, ref) => {
    const {
      size = 24,
      color = 'currentColor',
      variant = defaultVariant,
      className,
      strokeWidth: _sw,
      ...rest
    } = props

    return (
      <Component
        ref={ref}
        size={size}
        color={color}
        variant={variant}
        className={className}
        {...rest}
      />
    )
  })
  Icon.displayName = Component.displayName || 'IconsaxIcon'
  return Icon
}

// Pixel-perfect Iconsax linear cross for Close / XIcon
export const X = React.forwardRef<SVGSVGElement, IconProps>(
  ({ size = 24, color = 'currentColor', className, strokeWidth: _sw, ...props }, ref) => (
    <svg
      ref={ref}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      {...props}
    >
      <path
        d="M18 6L6 18M6 6l12 12"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
)
X.displayName = 'X'
export const XIcon = X

// Direct Iconsax Component Exports (React 19 Safe with explicit currentColor, size & variant defaults)
export const ArrowRight2 = wrap(Iconsax.ArrowRight2)
export const ArrowSwapHorizontal = wrap(Iconsax.ArrowSwapHorizontal)
export const Driver2 = wrap(Iconsax.Driver2)
export const FlashCircle = wrap(Iconsax.FlashCircle)
export const FolderCloud = wrap(Iconsax.FolderCloud)
export const FolderConnection = wrap(Iconsax.FolderConnection)
export const Global = wrap(Iconsax.Global)
export const Transmit = wrap(Iconsax.Transmit)

// Direct & Equivalent Iconsax mappings for all 123 project icons
export const Activity = wrap(Iconsax.Activity)
export const AlertCircle = wrap(Iconsax.Danger)
export const AlertTriangle = wrap(Iconsax.Warning2)
export const Archive = wrap(Iconsax.Archive)
export const ArrowDown = wrap(Iconsax.ArrowDown)
export const ArrowLeft = wrap(Iconsax.ArrowLeft)
export const ArrowLeftRight = wrap(Iconsax.ArrowSwapHorizontal)
export const ArrowRight = wrap(Iconsax.ArrowRight)
export const ArrowUp = wrap(Iconsax.ArrowUp)
export const ArrowUpRight = wrap(Iconsax.ExportCurve)
export const BarChart3 = wrap(Iconsax.StatusUp)
export const BellOff = wrap(Iconsax.NotificationStatus)
export const Bot = wrap(Iconsax.CpuSetting)
export const Box = wrap(Iconsax.Box)
export const Check = wrap(Iconsax.TickCircle)
export const CheckCircle = wrap(Iconsax.TickCircle)
export const CheckCircle2 = wrap(Iconsax.TickCircle)
export const CheckIcon = wrap(Iconsax.TickCircle)
export const ChevronDown = wrap(Iconsax.ArrowDown2)
export const ChevronDownIcon = wrap(Iconsax.ArrowDown2)
export const ChevronLeft = wrap(Iconsax.ArrowLeft2)
export const ChevronLeftIcon = wrap(Iconsax.ArrowLeft2)
export const ChevronRight = wrap(Iconsax.ArrowRight2)
export const ChevronRightIcon = wrap(Iconsax.ArrowRight2)
export const ChevronUp = wrap(Iconsax.ArrowUp2)
export const ChevronUpIcon = wrap(Iconsax.ArrowUp2)
export const ChevronsLeft = wrap(Iconsax.ArrowLeft3)
export const ChevronsRight = wrap(Iconsax.ArrowRight3)
export const ChevronsUpDown = wrap(Iconsax.ArrowSwapVertical)
export const CircleCheckIcon = wrap(Iconsax.TickCircle)
export const CircleIcon = wrap(Iconsax.RecordCircle)
export const Clipboard = wrap(Iconsax.Clipboard)
export const ClipboardPaste = wrap(Iconsax.ClipboardImport)
export const Clock = wrap(Iconsax.Clock)
export const Code = wrap(Iconsax.Code)
export const Code2 = wrap(Iconsax.CodeCircle)
export const Compass = wrap(Iconsax.Discover)
export const Copy = wrap(Iconsax.Copy)
export const Cpu = wrap(Iconsax.Cpu)
export const Database = wrap(Iconsax.Data)
export const Download = wrap(Iconsax.DocumentDownload)
export const Edit2 = wrap(Iconsax.Edit2)
export const Edit3 = wrap(Iconsax.Edit)
export const ExternalLink = wrap(Iconsax.Export)
export const Eye = wrap(Iconsax.Eye)
export const EyeOff = wrap(Iconsax.EyeSlash)
export const File = wrap(Iconsax.Document)
export const FileCode = wrap(Iconsax.DocumentCode)
export const FileJson = wrap(Iconsax.DocumentCode2)
export const FileQuestion = wrap(Iconsax.DocumentFilter)
export const FileText = wrap(Iconsax.DocumentText)
export const FileUp = wrap(Iconsax.DocumentUpload)
export const Filter = wrap(Iconsax.Filter)
export const Fingerprint = wrap(Iconsax.FingerScan)
export const Folder = wrap(Iconsax.Folder)
export const FolderPlus = wrap(Iconsax.FolderAdd)
export const FolderSearch = wrap(Iconsax.FolderFavorite)
export const FolderSync = wrap(Iconsax.FolderConnection)
export const Globe = wrap(Iconsax.Global)
export const HardDrive = wrap(Iconsax.Driver)
export const HelpCircle = wrap(Iconsax.InfoCircle)
export const History = wrap(Iconsax.Clock)
export const Home = wrap(Iconsax.Home)
export const Image = wrap(Iconsax.Image)
export const InfoIcon = wrap(Iconsax.InfoCircle)
export const Key = wrap(Iconsax.Key)
export const KeyRound = wrap(Iconsax.KeySquare)
export const Layers = wrap(Iconsax.Layer)
export const LayoutDashboard = wrap(Iconsax.Category)
export const Link2 = wrap(Iconsax.Link2)
export const Loader2 = wrap(Iconsax.RotateRight)
export const Loader2Icon = wrap(Iconsax.RotateRight)
export const Lock = wrap(Iconsax.Lock)
export const LogOut = wrap(Iconsax.Logout)
export const MinusIcon = wrap(Iconsax.Minus)
export const MoreHorizontal = wrap(Iconsax.More)
export const MoreHorizontalIcon = wrap(Iconsax.More)
export const Music = wrap(Iconsax.Music)
export const Network = wrap(Iconsax.FolderConnection)
export const OctagonXIcon = wrap(Iconsax.CloseCircle)
export const PanelLeftIcon = wrap(Iconsax.SidebarLeft)
export const Pause = wrap(Iconsax.Pause)
export const PieChart = wrap(Iconsax.Chart2)
export const Play = wrap(Iconsax.Play)
export const Plus = wrap(Iconsax.Add)
export const Radio = wrap(Iconsax.Radio)
export const RefreshCw = wrap(Iconsax.Refresh2)
export const RotateCcw = wrap(Iconsax.RotateLeft)
export const RotateCw = wrap(Iconsax.RotateRight)
export const Save = wrap(Iconsax.Save2)
export const ScrollText = wrap(Iconsax.ReceiptItem)
export const Search = wrap(Iconsax.SearchNormal1)
export const Send = wrap(Iconsax.Send)
export const Server = wrap(Iconsax.Driver2)
export const Settings = wrap(Iconsax.Setting2)
export const Settings2 = wrap(Iconsax.Setting3)
export const Share2 = wrap(Iconsax.Share)
export const Shield = wrap(Iconsax.Shield)
export const ShieldAlert = wrap(Iconsax.ShieldCross)
export const ShieldCheck = wrap(Iconsax.ShieldTick)
export const ShieldOff = wrap(Iconsax.ShieldSlash)
export const Slack = wrap(Iconsax.Slack)
export const Smartphone = wrap(Iconsax.Mobile)
export const Sparkles = wrap(Iconsax.MagicStar)
export const Table = wrap(Iconsax.RowVertical)
export const Tag = wrap(Iconsax.Tag)
export const Terminal = wrap(Iconsax.Command)
export const Trash2 = wrap(Iconsax.Trash)
export const TrendingUp = wrap(Iconsax.TrendUp)
export const TriangleAlertIcon = wrap(Iconsax.Warning2)
export const Upload = wrap(Iconsax.DocumentUpload)
export const UploadCloud = wrap(Iconsax.CloudAdd)
export const User = wrap(Iconsax.User)
export const UserMinus = wrap(Iconsax.UserMinus)
export const UserPlus = wrap(Iconsax.UserAdd)
export const Users = wrap(Iconsax.People)
export const Video = wrap(Iconsax.Video)
export const Wifi = wrap(Iconsax.Wifi)
export const WifiOff = wrap(Iconsax.WifiSquare)
export const XCircle = wrap(Iconsax.CloseCircle)
export const Zap = wrap(Iconsax.Flash)
