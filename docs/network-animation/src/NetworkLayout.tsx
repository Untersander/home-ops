import {AbsoluteFill, interpolate, useCurrentFrame} from 'remotion';
import {Theme, ThemeName, themes} from './theme';

export const FPS = 30;
// Each scene is its own GIF: the physical layout and the inside of the node.
// Everything is visible from the first frame, only packets move (and captions change),
// so packet periods must divide the duration for the GIF to loop seamlessly.
export const PHYSICAL_DURATION = 240;
const CAPTION_LENGTH = 90;

const SANS = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

type Pt = [number, number];

const segLen = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1]);
const polyLen = (pts: Pt[]) => pts.slice(1).reduce((sum, p, i) => sum + segLen(pts[i], p), 0);
const toPath = (pts: Pt[]) => 'M ' + pts.map((p) => p.join(' ')).join(' L ');

const pointAt = (pts: Pt[], t: number): Pt => {
  let d = t * polyLen(pts);
  for (let i = 1; i < pts.length; i++) {
    const l = segLen(pts[i - 1], pts[i]);
    if (d <= l) {
      const r = l === 0 ? 0 : d / l;
      return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * r, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * r];
    }
    d -= l;
  }
  return pts[pts.length - 1];
};

const fade = (frame: number, start: number, length = 15) =>
  interpolate(frame, [start, start + length], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});

const Link: React.FC<{pts: Pt[]; color: string; width?: number}> = ({pts, color, width = 3}) => (
  <path d={toPath(pts)} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
);

// Packets travelling along a path, looping
const Packets: React.FC<{pts: Pt[]; color: string; period?: number; count?: number; offset?: number}> = ({
  pts,
  color,
  period = 60,
  count = 2,
  offset = 0,
}) => {
  const frame = useCurrentFrame();
  return (
    <g>
      {Array.from({length: count}, (_, k) => {
        const t = ((frame / period + k / count + offset) % 1 + 1) % 1;
        const [x, y] = pointAt(pts, t);
        return (
          <g key={k}>
            <circle cx={x} cy={y} r={11} fill={color} opacity={0.18} />
            <circle cx={x} cy={y} r={5.5} fill={color} />
          </g>
        );
      })}
    </g>
  );
};

const Card: React.FC<{
  t: Theme;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  lines?: string[];
  accent: string;
  mono?: boolean;
  children?: React.ReactNode;
}> = ({t, x, y, w, h, title, lines = [], accent, mono = false, children}) => {
  const left = x - w / 2;
  const top = y - h / 2;
  const lineHeight = 22;
  const titleY = lines.length === 0 && !children ? y + 7 : top + 32;
  return (
    <g>
      <rect x={left} y={top} width={w} height={h} rx={14} fill={t.card} stroke={t.border} strokeWidth={1.5} />
      <rect x={left} y={top + 12} width={4} height={h - 24} rx={2} fill={accent} />
      <text x={left + 20} y={titleY} fill={t.fg} fontFamily={SANS} fontSize={19} fontWeight={600}>
        {title}
      </text>
      {lines.map((line, i) => (
        <text
          key={line}
          x={left + 20}
          y={titleY + 26 + i * lineHeight}
          fill={t.muted}
          fontFamily={mono ? MONO : SANS}
          fontSize={mono ? 14.5 : 15.5}
          style={{whiteSpace: 'pre'}}
        >
          {line}
        </text>
      ))}
      {children}
    </g>
  );
};

const Label: React.FC<{t: Theme; x: number; y: number; text: string; color?: string; anchor?: 'start' | 'middle' | 'end'}> = ({
  t,
  x,
  y,
  text,
  color,
  anchor = 'start',
}) => (
  <text x={x} y={y} textAnchor={anchor} fill={color ?? t.muted} fontFamily={MONO} fontSize={15} fontWeight={600}>
    {text}
  </text>
);

const Heading: React.FC<{t: Theme; title: string; sub: string}> = ({t, title, sub}) => (
  <>
    <text x={56} y={62} fill={t.fg} fontFamily={SANS} fontSize={30} fontWeight={700}>
      {title}
    </text>
    <text x={56} y={90} fill={t.muted} fontFamily={SANS} fontSize={17}>
      {sub}
    </text>
  </>
);

// Scene 1: devices and links, as in network-topology.drawio.svg
const Physical: React.FC<{t: Theme}> = ({t}) => {
  const wan: Pt[] = [[640, 212], [640, 330]];
  const ap: Pt[] = [[560, 430], [560, 500], [330, 500], [330, 558]];
  const desktop: Pt[] = [[720, 430], [720, 500], [950, 500], [950, 558]];
  return (
    <>
      <Heading t={t} title="k8s.garden network" sub="One Talos node is router, firewall and Kubernetes cluster" />

      <Link pts={wan} color={t.blue} width={5} />
      <Link pts={ap} color={t.green} />
      <Link pts={desktop} color={t.purple} width={4} />
      <Label t={t} x={658} y={276} text="25 Gbps" color={t.blue} />
      <Label t={t} x={445} y={490} text="2.5 Gbps" color={t.green} anchor="middle" />
      <Label t={t} x={835} y={490} text="25 Gbps" color={t.purple} anchor="middle" />

      {/* Down- and upstream in two lanes */}
      <Packets pts={[[634, 212], [634, 330]]} color={t.blue} period={40} count={2} />
      <Packets pts={[[646, 330], [646, 212]]} color={t.blue} period={40} count={2} offset={0.25} />
      <Packets pts={ap} color={t.green} period={80} count={2} />
      <Packets pts={desktop} color={t.purple} period={48} count={3} />

      <Card t={t} x={640} y={170} w={320} h={84} title="Internet" lines={['Init7 · IPv4 + IPv6 /48']} accent={t.blue} />
      <Card t={t} x={640} y={380} w={380} h={100} title="cp-0 · Router / Server" lines={['Talos · Kubernetes · 10.0.0.1']} accent={t.orange} />
      <Card t={t} x={330} y={600} w={270} h={84} title="Access Point" lines={['Wi-Fi clients']} accent={t.green} />
      <Card t={t} x={950} y={600} w={270} h={84} title="Gaming Desktop" lines={['LAN client']} accent={t.purple} />
      <Card
        t={t}
        x={1050}
        y={232}
        w={350}
        h={170}
        title="Address space"
        mono
        lines={['LAN       10.0.0.0/24', 'IPv6      2a02:169:4a00::/48', 'Pods      10.244.0.0/16', 'Services  10.96.0.0/12', 'LB-IPAM   10.0.0.20–29']}
        accent={t.muted}
       
      />
    </>
  );
};

const CAPTIONS = [
  'From the internet only WireGuard and a game server get through',
  'LAN traffic passes nftables too, br0 is not filtered yet',
  'Pi-hole hands out addresses and answers DNS for the LAN',
  'All web apps sit behind one gateway IP with TLS and SSO',
  'Outbound: nftables masquerades IPv4, IPv6 is routed natively',
];
export const INSIDE_DURATION = CAPTIONS.length * CAPTION_LENGTH;

// Cycles through the captions, each fades in and stays for CAPTION_LENGTH frames
const Caption: React.FC<{t: Theme}> = ({t}) => {
  const frame = useCurrentFrame();
  const i = Math.floor(frame / CAPTION_LENGTH) % CAPTIONS.length;
  const o = fade(frame, i * CAPTION_LENGTH, 12);
  return (
    <text x={1224} y={62} textAnchor="end" fill={t.fg} fontFamily={SANS} fontSize={18} fontWeight={500} opacity={o}>
      {CAPTIONS[i]}
    </text>
  );
};

// One section of the nftables card: the interface and what its chains do
const Chain: React.FC<{t: Theme; x: number; y: number; title: string; lines: string[]; color: string}> = ({t, x, y, title, lines, color}) => (
  <>
    <text x={x} y={y} fill={color} fontFamily={MONO} fontSize={15} fontWeight={700}>
      {title}
    </text>
    {lines.map((line, i) => (
      <text key={line} x={x} y={y + 24 + i * 22} fill={t.muted} fontFamily={MONO} fontSize={14.5} style={{whiteSpace: 'pre'}}>
        {line}
      </text>
    ))}
  </>
);

// Scene 2: inside cp-0, every packet from the WAN or the LAN crosses nftables
const Inside: React.FC<{t: Theme}> = ({t}) => {
  const busX = 570;
  // Where the WAN and LAN wires enter the node, they run behind the nftables card
  const wanY = 208;
  const lanY = 454;
  const wanServices = [
    {y: 170, title: 'WireGuard', lines: ['51820/udp · remote access'], accent: t.green},
    {y: 246, title: 'Game server', lines: ['16261-16262/udp · Zomboid'], accent: t.green},
  ];
  const lanServices = [
    {y: 340, title: 'Pi-hole · 10.0.0.5', lines: ['DNS · DHCP'], accent: t.orange},
    {y: 416, title: 'Envoy Gateway · 10.0.0.20', lines: ['HTTPS · Git over SSH'], accent: t.blue},
    {y: 492, title: 'NFS · 10.0.0.22', lines: ['file shares'], accent: t.muted},
    {y: 568, title: 'SMB · 10.0.0.23', lines: ['document inbox'], accent: t.muted},
  ];
  const services = [...wanServices, ...lanServices];
  const envoyY = lanServices[1].y;
  return (
    <>
      <Heading t={t} title="Inside cp-0" sub="Talos · Cilium · nftables" />
      <Caption t={t} />

      <rect x={230} y={112} width={1010} height={528} rx={18} fill="none" stroke={t.border} strokeWidth={2} strokeDasharray="10 8" />
      <text x={250} y={134} fill={t.muted} fontFamily={MONO} fontSize={15} fontWeight={600}>
        cp-0
      </text>

      {/* Wiring: WAN and LAN both run through nftables onto their own bus */}
      <Link pts={[[190, wanY], [busX, wanY]]} color={t.blue} width={4} />
      <Link pts={[[190, lanY], [busX, lanY]]} color={t.green} width={4} />
      <Link pts={[[busX, wanServices[0].y], [busX, wanServices[1].y]]} color={t.border} width={6} />
      <Link pts={[[busX, lanServices[0].y], [busX, lanServices[3].y]]} color={t.border} width={6} />
      {services.map((svc) => (
        <Link key={svc.title} pts={[[busX, svc.y], [640, svc.y]]} color={t.border} width={4} />
      ))}
      <Link pts={[[940, envoyY], [985, envoyY]]} color={t.border} width={4} />
      <Label t={t} x={1225} y={628} text="Cilium L2 announces the 10.0.0.x service IPs" anchor="end" />

      {/* Flows, packets disappear behind the nftables card while they cross it */}
      <Packets pts={[[190, wanY], [busX, wanY], [busX, 170], [640, 170]]} color={t.green} period={50} count={2} />
      <Packets pts={[[190, wanY], [busX, wanY], [busX, 246], [640, 246]]} color={t.green} period={50} count={1} offset={0.5} />
      <Packets pts={[[190, lanY], [busX, lanY], [busX, 340], [640, 340]]} color={t.orange} period={45} count={1} />
      <Packets pts={[[640, 340], [busX, 340], [busX, lanY], [190, lanY]]} color={t.orange} period={45} count={1} offset={0.5} />
      <Packets pts={[[190, lanY], [busX, lanY], [busX, envoyY], [640, envoyY]]} color={t.blue} period={50} count={2} />
      <Packets pts={[[940, envoyY], [985, envoyY]]} color={t.blue} period={25} count={1} />
      <Packets pts={[[190, lanY], [320, lanY], [320, wanY], [190, wanY]]} color={t.purple} period={50} count={2} />

      {/* Boxes on top of the wiring */}
      <Card t={t} x={115} y={wanY} w={150} h={70} title="Internet" lines={['Init7']} accent={t.blue} />
      <Card t={t} x={115} y={lanY} w={150} h={90} title="LAN" lines={['Access Point', 'Desktop']} accent={t.green} />
      <Card t={t} x={390} y={370} w={250} h={460} title="nftables" accent={t.purple}>
        <Chain
          t={t}
          x={285}
          y={wanY + 4}
          title="WAN · enp2s0f0np0"
          color={t.blue}
          lines={['in   51820/udp', 'in   16261-16262/udp', 'drop everything else', 'out  IPv4 masquerade']}
        />
        <line x1={285} x2={495} y1={wanY + 120} y2={wanY + 120} stroke={t.border} strokeWidth={1.5} />
        <Chain t={t} x={285} y={lanY - 18} title="LAN · br0" color={t.green} lines={['accept all', 'not filtered yet']} />
      </Card>
      {services.map((svc) => (
        <Card key={svc.title} t={t} x={790} y={svc.y} w={300} h={68} title={svc.title} lines={svc.lines} accent={svc.accent} />
      ))}
      <Card t={t} x={1110} y={envoyY} w={240} h={128} title="Apps" lines={['*.k8s.garden', '*.noreplay.org', 'Authelia SSO']} accent={t.blue} />
    </>
  );
};

const Scene: React.FC<{theme: ThemeName; children: (t: Theme) => React.ReactNode}> = ({theme, children}) => {
  const t = themes[theme];
  return (
    <AbsoluteFill style={{backgroundColor: t.bg}}>
      <svg viewBox="0 0 1280 720" width="100%" height="100%">
        {children(t)}
      </svg>
    </AbsoluteFill>
  );
};

export const PhysicalLayout: React.FC<{theme: ThemeName}> = ({theme}) => (
  <Scene theme={theme}>
    {(t) => <Physical t={t} />}
  </Scene>
);

export const InsideLayout: React.FC<{theme: ThemeName}> = ({theme}) => (
  <Scene theme={theme}>
    {(t) => <Inside t={t} />}
  </Scene>
);
