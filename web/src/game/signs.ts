/**
 * Indian road-sign catalog: powers the Sticker Book, the quiz revive and the
 * in-run sign pickups. One canvas painter renders every sign so the 3D
 * pickups, quiz art and album stickers always match.
 */
export interface SignDef {
  id: string;
  name: string;
  /** Kid-friendly one-liner shown in the sticker book and tips. */
  meaning: string;
  /** Short phrasing used as a quiz answer option. */
  option: string;
}

export const SIGNS: SignDef[] = [
  { id: "stop", name: "Stop", meaning: "Stop completely. Go only when the road is clear.", option: "Stop completely, then go when clear" },
  { id: "give_way", name: "Give Way", meaning: "Let other vehicles and walkers go first.", option: "Let others go first" },
  { id: "school", name: "School Ahead", meaning: "School nearby — slow down, children may cross!", option: "School ahead — watch for children" },
  { id: "ped_crossing", name: "Pedestrian Crossing", meaning: "People cross here. Slow down and let them pass.", option: "People cross the road here" },
  { id: "signal_ahead", name: "Signal Ahead", meaning: "Traffic light coming up — get ready to stop.", option: "Traffic light ahead" },
  { id: "no_entry", name: "No Entry", meaning: "Do not enter this road from here.", option: "Do not enter this road" },
  { id: "speed_30", name: "Speed Limit 30", meaning: "Don't go faster than 30 km/h here.", option: "Go no faster than 30 km/h" },
  { id: "no_horn", name: "Horn Prohibited", meaning: "No honking — keep this area quiet.", option: "No honking here" },
  { id: "no_uturn", name: "No U-Turn", meaning: "You must not take a U-turn here.", option: "No U-turns allowed" },
  { id: "men_at_work", name: "Men at Work", meaning: "Road work ahead — slow down and be careful.", option: "Road work ahead — be careful" },
  { id: "cycle_crossing", name: "Cycle Crossing", meaning: "Cyclists cross here — watch out for them.", option: "Cyclists cross here" },
  { id: "hospital", name: "Hospital", meaning: "Hospital nearby — go slow and stay silent.", option: "Hospital nearby — go slow" },
];

export function signById(id: string): SignDef | undefined {
  return SIGNS.find((s) => s.id === id);
}

const RED = "#d21f2b";
const INK = "#17181c";

function triangleFace(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.moveTo(128, 16);
  ctx.lineTo(240, 218);
  ctx.lineTo(16, 218);
  ctx.closePath();
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineJoin = "round";
  ctx.lineWidth = 20;
  ctx.strokeStyle = RED;
  ctx.stroke();
}

function circleFace(ctx: CanvasRenderingContext2D): void {
  ctx.beginPath();
  ctx.arc(128, 128, 100, 0, Math.PI * 2);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.lineWidth = 22;
  ctx.strokeStyle = RED;
  ctx.stroke();
}

function prohibitSlash(ctx: CanvasRenderingContext2D): void {
  ctx.strokeStyle = RED;
  ctx.lineWidth = 15;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(64, 192);
  ctx.lineTo(192, 64);
  ctx.stroke();
}

/** Simple striding stick figure used by the school / pedestrian glyphs. */
function walker(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number): void {
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 9 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(cx, cy - 32 * s, 10 * s, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(cx, cy - 20 * s);
  ctx.lineTo(cx, cy + 2 * s);
  // legs mid-stride
  ctx.moveTo(cx, cy + 2 * s);
  ctx.lineTo(cx - 14 * s, cy + 28 * s);
  ctx.moveTo(cx, cy + 2 * s);
  ctx.lineTo(cx + 12 * s, cy + 28 * s);
  // arms
  ctx.moveTo(cx, cy - 15 * s);
  ctx.lineTo(cx - 13 * s, cy - 2 * s);
  ctx.moveTo(cx, cy - 15 * s);
  ctx.lineTo(cx + 14 * s, cy - 6 * s);
  ctx.stroke();
}

function drawGlyph(ctx: CanvasRenderingContext2D, id: string): void {
  ctx.fillStyle = INK;
  ctx.strokeStyle = INK;
  switch (id) {
    case "school": {
      walker(ctx, 106, 152, 1.05);
      walker(ctx, 152, 160, 0.82);
      break;
    }
    case "ped_crossing": {
      walker(ctx, 128, 138, 1.05);
      ctx.fillStyle = INK;
      ctx.fillRect(76, 186, 104, 9);
      ctx.fillRect(88, 201, 80, 8);
      break;
    }
    case "signal_ahead": {
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.roundRect(109, 98, 38, 92, 8);
      ctx.fill();
      const dots: [string, number][] = [["#e11d48", 117], ["#f59e0b", 143], ["#22c55e", 169]];
      dots.forEach(([c, y]) => {
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.arc(128, y, 9.5, 0, Math.PI * 2);
        ctx.fill();
      });
      break;
    }
    case "men_at_work": {
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(110, 118, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(112, 130);
      ctx.lineTo(134, 166);
      ctx.moveTo(134, 166);
      ctx.lineTo(118, 196);
      ctx.moveTo(134, 166);
      ctx.lineTo(148, 194);
      ctx.moveTo(118, 140);
      ctx.lineTo(154, 158);
      ctx.moveTo(154, 158);
      ctx.lineTo(176, 178);
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(180, 196, 22, 9, 0, Math.PI, 0);
      ctx.fill();
      break;
    }
    case "cycle_crossing": {
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.arc(96, 172, 24, 0, Math.PI * 2);
      ctx.moveTo(184, 172);
      ctx.arc(160, 172, 24, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(96, 172);
      ctx.lineTo(122, 134);
      ctx.lineTo(160, 172);
      ctx.moveTo(122, 134);
      ctx.lineTo(148, 134);
      ctx.moveTo(148, 134);
      ctx.lineTo(158, 120);
      ctx.moveTo(116, 130);
      ctx.lineTo(108, 118);
      ctx.stroke();
      break;
    }
    default:
      break;
  }
}

/** Paints one sign centered in a size×size square (transparent corners). */
export function drawSign(ctx: CanvasRenderingContext2D, id: string, size: number): void {
  ctx.clearRect(0, 0, size, size);
  ctx.save();
  ctx.scale(size / 256, size / 256);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  switch (id) {
    case "stop": {
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
        const x = 128 + Math.cos(a) * 108;
        const y = 128 + Math.sin(a) * 108;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = "#c1121f";
      ctx.fill();
      ctx.lineWidth = 9;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 58px 'Arial Black', Arial, sans-serif";
      ctx.fillText("STOP", 128, 132);
      break;
    }
    case "give_way": {
      ctx.beginPath();
      ctx.moveTo(22, 42);
      ctx.lineTo(234, 42);
      ctx.lineTo(128, 226);
      ctx.closePath();
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.lineJoin = "round";
      ctx.lineWidth = 24;
      ctx.strokeStyle = RED;
      ctx.stroke();
      break;
    }
    case "no_entry": {
      ctx.beginPath();
      ctx.arc(128, 128, 104, 0, Math.PI * 2);
      ctx.fillStyle = RED;
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.beginPath();
      ctx.roundRect(52, 115, 152, 26, 8);
      ctx.fill();
      break;
    }
    case "speed_30": {
      circleFace(ctx);
      ctx.fillStyle = INK;
      ctx.font = "900 86px 'Arial Black', Arial, sans-serif";
      ctx.fillText("30", 128, 134);
      break;
    }
    case "no_horn": {
      circleFace(ctx);
      // horn bulb + trumpet + sound arcs
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.arc(94, 146, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(100, 138);
      ctx.lineTo(158, 116);
      ctx.lineTo(158, 170);
      ctx.lineTo(100, 154);
      ctx.closePath();
      ctx.fill();
      ctx.lineWidth = 7;
      ctx.strokeStyle = INK;
      ctx.beginPath();
      ctx.arc(166, 143, 14, -0.9, 0.9);
      ctx.moveTo(180, 130);
      ctx.arc(166, 143, 24, -0.9, 0.9);
      ctx.stroke();
      prohibitSlash(ctx);
      break;
    }
    case "no_uturn": {
      circleFace(ctx);
      ctx.strokeStyle = INK;
      ctx.lineWidth = 13;
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(152, 184);
      ctx.lineTo(152, 132);
      ctx.arc(129, 132, 23, 0, Math.PI, true);
      ctx.lineTo(106, 158);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.beginPath();
      ctx.moveTo(90, 154);
      ctx.lineTo(122, 154);
      ctx.lineTo(106, 184);
      ctx.closePath();
      ctx.fill();
      prohibitSlash(ctx);
      break;
    }
    case "hospital": {
      ctx.beginPath();
      ctx.roundRect(28, 28, 200, 200, 22);
      ctx.fillStyle = "#1247a5";
      ctx.fill();
      ctx.lineWidth = 8;
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.fillStyle = "#ffffff";
      ctx.font = "900 108px 'Arial Black', Arial, sans-serif";
      ctx.fillText("H", 112, 138);
      ctx.fillRect(170, 52, 14, 44);
      ctx.fillRect(155, 67, 44, 14);
      break;
    }
    case "school":
    case "ped_crossing":
    case "signal_ahead":
    case "men_at_work":
    case "cycle_crossing": {
      triangleFace(ctx);
      drawGlyph(ctx, id);
      break;
    }
    default: {
      circleFace(ctx);
      break;
    }
  }
  ctx.restore();
}
