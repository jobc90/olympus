// ============================================================================
// Olympus Dashboard — Core Type Definitions
// ============================================================================

// ---------------------------------------------------------------------------
// Worker Behavior System (Olympus-specific: 16 behaviors)
// ---------------------------------------------------------------------------

/** Worker behaviors (12) + Codex behaviors (4) */
export type WorkerBehavior =
  // Worker behaviors
  | 'working'
  | 'idle'
  | 'thinking'
  | 'completed'
  | 'error'
  | 'offline'
  | 'chatting'
  | 'reviewing'
  | 'deploying'
  | 'resting'
  | 'collaborating'
  | 'starting'
  // Codex behaviors
  | 'supervising'
  | 'directing'
  | 'analyzing'
  | 'meeting';

/** Gemini advisor behavior */
export type GeminiBehavior =
  | 'idle'
  | 'scanning'
  | 'analyzing'
  | 'advising'
  | 'refreshing'
  | 'offline';

/** Simplified Olympus Mountain states (mapped from WorkerBehavior) */
export type WorkerState =
  | 'idle'
  | 'working'
  | 'thinking'
  | 'deploying'
  | 'resting'
  | 'meeting'
  | 'reviewing'
  | 'waiting'
  | 'arriving';

/** Olympus Mountain zone identifiers */
export type ZoneId =
  | 'sanctuary_0' | 'sanctuary_1' | 'sanctuary_2' | 'sanctuary_3' | 'sanctuary_4' | 'sanctuary_5'
  | 'zeus_temple'
  | 'ambrosia_hall'
  | 'agora'
  | 'oracle_stone'
  | 'athenas_library'
  | 'olympus_garden'
  | 'oracle_chamber'
  | 'propylaea'
  | 'gods_plaza';

/** Pixel coordinate in screen space */
export interface ScreenPos {
  x: number;
  y: number;
}

/** Grid coordinate in isometric tile space */
export interface GridPos {
  col: number;
  row: number;
}

/** Character facing direction */
export type Direction = 'n' | 's' | 'e' | 'w';

/** Character animation state */
export type CharacterAnim =
  | 'stand'
  | 'walk_frame1'
  | 'walk_frame2'
  | 'sit_typing'
  | 'drink_coffee'
  | 'raise_hand'
  | 'headphones'
  | 'sleep'
  | 'run'
  | 'sit_idle'
  | 'thumbs_up'
  | 'hand_task'
  | 'keyboard_mash'
  | 'stretch'
  | 'celebrate'
  | 'point'
  | 'nod'
  | 'wave';

/** Furniture/object type */
export type FurnitureType =
  | 'desk'
  | 'chair'
  | 'monitor'
  | 'keyboard'
  | 'big_desk'
  | 'floor_window'
  | 'coffee_machine'
  | 'snack_shelf'
  | 'water_cooler'
  | 'small_table'
  | 'round_table'
  | 'long_table'
  | 'whiteboard_obj'
  | 'bookshelf'
  | 'reading_chair'
  | 'sofa'
  | 'coffee_table'
  | 'server_rack'
  | 'potted_plant'
  | 'carpet'
  | 'wall_clock'
  | 'poster'
  | 'meeting_chair'
  | 'door_mat'
  | 'standing_desk'
  | 'dual_monitor'
  | 'arcade_machine'
  | 'vending_machine'
  | 'trophy_shelf'
  | 'aquarium'
  | 'marble_round_table'
  | 'cloud_seat';

/** A furniture item placed on the map */
export interface FurnitureItem {
  type: FurnitureType;
  col: number;
  row: number;
  variant?: number;
}

/** Zone definition */
export interface Zone {
  id: ZoneId;
  label: string;
  emoji: string;
  center: GridPos;
  minCol: number;
  maxCol: number;
  minRow: number;
  maxRow: number;
}

/** A speech bubble */
export interface Bubble {
  text: string;
  ttl: number;
  x: number;
  y: number;
  workerId?: string;
}

/** Effect particle */
export interface Particle {
  type: 'zzz' | 'sparkle' | 'code' | 'question' | 'check' | 'coffee_steam' | 'smoke' | 'error' | 'lightning' | 'binary' | 'lightbulb' | 'fire' | 'confetti';
  x: number;
  y: number;
  age: number;
  maxAge: number;
}

/** Tile walkability */
export type TileType = 'floor' | 'wall' | 'furniture' | 'door';

// ---------------------------------------------------------------------------
// Worker Runtime (Olympus Mountain Engine)
// ---------------------------------------------------------------------------

export interface WorkerRuntime {
  id: string;
  currentState: WorkerState;
  pos: GridPos;
  screenPos: ScreenPos;
  direction: Direction;
  anim: CharacterAnim;
  path: GridPos[];
  transitioning: boolean;
  deskZone: ZoneId;
}

export interface CodexRuntime {
  anim: CharacterAnim;
}

/** Gemini advisor runtime (OlympusMountain) */
export interface GeminiRuntime {
  behavior: GeminiBehavior;
  currentTask: string | null;
  anim: CharacterAnim;
  pos: GridPos;
  screenPos: ScreenPos;
  direction: Direction;
  path: GridPos[];
}

/** NPC runtime (유니콘, 큐피트) */
export interface NpcRuntime {
  id: string;
  type: 'unicorn' | 'cupid';
  pos: GridPos;
  screenPos: ScreenPos;
  direction: Direction;
  path: GridPos[];
  homeZone: ZoneId;
}

export interface OlympusMountainState {
  workers: WorkerRuntime[];
  codex: CodexRuntime;
  gemini: GeminiRuntime;
  npcs: NpcRuntime[];
  bubbles: Bubble[];
  particles: Particle[];
  tick: number;
  autoMode: boolean;
  autoTimer: number;
  dayNightPhase: number;
}

// ---------------------------------------------------------------------------
// Dashboard Data Types
// ---------------------------------------------------------------------------

/** Avatar preset for workers */
export type WorkerAvatar = 'athena' | 'poseidon' | 'ares' | 'apollo' | 'artemis' | 'hermes' | 'hephaestus' | 'dionysus' | 'demeter' | 'aphrodite' | 'hera' | 'hades' | 'persephone' | 'prometheus' | 'helios' | 'nike' | 'pan' | 'hecate' | 'iris' | 'heracles' | 'selene';

/** Avatar preset for the codex (orchestrator) */
export type CodexAvatar = 'zeus';

/** Avatar preset for the Gemini advisor */
export type GeminiAvatar = 'hera';

/** Theme preset */
export type ThemeName = 'midnight' | 'void' | 'warm' | 'neon';

/** Single worker configuration */
export interface WorkerConfig {
  id: string;
  name: string;
  emoji: string;
  color: string;
  avatar: WorkerAvatar;
  behavior?: string;
  skinToneIndex?: number;
  projectPath?: string;
}

/** Codex (orchestrator) configuration */
export interface CodexConfig {
  name: string;
  emoji: string;
  avatar: CodexAvatar;
}

/** Gemini advisor configuration */
export interface GeminiConfig {
  name: string;
  emoji: string;
  avatar: GeminiAvatar;
}

/** Gateway connection settings */
export interface GatewayConfig {
  url: string;
  token: string;
}

/** Root configuration for the dashboard */
export interface DashboardConfig {
  workers: WorkerConfig[];
  codex: CodexConfig;
  gemini: GeminiConfig;
  gateway: GatewayConfig;
  theme: ThemeName;
  connected: boolean;
}

// ---------------------------------------------------------------------------
// Worker Dashboard State
// ---------------------------------------------------------------------------

/** Token usage snapshot */
export interface TokenUsage {
  timestamp: number;
  input: number;
  output: number;
  total: number;
}

/** A single task */
export interface WorkerTask {
  id: string;
  title: string;
  status: 'active' | 'completed' | 'failed';
  startedAt: number;
  completedAt?: number;
  tokenUsage?: number;
}

/** Activity feed event */
export interface ActivityEvent {
  id: string;
  workerId: string;
  workerName: string;
  workerEmoji: string;
  type: 'state_change' | 'task_start' | 'task_complete' | 'task_fail' | 'tool_call' | 'message' | 'error' | 'system';
  message: string;
  timestamp: number;
}

/** Full worker dashboard state */
export interface WorkerDashboardState {
  behavior: WorkerBehavior;
  olympusMountainState: WorkerState;
  currentTask: WorkerTask | null;
  taskHistory: WorkerTask[];
  tokenUsage: TokenUsage[];
  totalTokens: number;
  contextTokens?: number;
  totalTasks: number;
  lastActivity: number;
  sessionLog: string[];
  uptime: number;
}

/** System-wide statistics */
export interface SystemStats {
  totalWorkers: number;
  activeWorkers: number;
  totalTokens: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  uptime: number;
  connected: boolean;
}
