// Screen savers: each make(c, W, H) draws on the canvas and returns a function that renders one frame.
const R = Math.random;

export const SAVERS = {
  bubbles: {
    name: 'Bubbles',
    make(c, W, H) {
      const bubbles = Array.from({length: 28}, () => ({x: R() * W, y: R() * H, r: 14 + R() * 46, vy: .3 + R() * .9, dx: R() * 6.28, h: 190 + R() * 60}));
      return () => {
        c.fillStyle = '#06162e'; c.fillRect(0, 0, W, H);
        bubbles.forEach((b) => {
          b.y -= b.vy; b.dx += .01; if (b.y + b.r < 0) { b.y = H + b.r; b.x = R() * W; }
          const x = b.x + Math.sin(b.dx) * 20, g2 = c.createRadialGradient(x - b.r * .35, b.y - b.r * .35, b.r * .1, x, b.y, b.r);
          g2.addColorStop(0, 'hsla(' + b.h + ',90%,90%,.85)'); g2.addColorStop(.6, 'hsla(' + b.h + ',90%,55%,.25)'); g2.addColorStop(1, 'hsla(' + b.h + ',90%,60%,.5)');
          c.fillStyle = g2; c.beginPath(); c.arc(x, b.y, b.r, 0, 6.283); c.fill();
        });
      };
    }
  },
  rain: {
    name: 'Code Rain',
    make(c, W, H) {
      const S = 16, cols = Math.ceil(W / S), chars = '01234567890ABCDEFGHJKLMNPRSTUVWXYZ$#@%&*+=<>', drop = Array.from({length: cols}, () => -R() * H / S);
      let n = 0; c.fillStyle = '#000'; c.fillRect(0, 0, W, H); c.font = 'bold ' + S + 'px "Courier New",monospace';
      return () => {
        if (++n % 2) return;
        c.fillStyle = 'rgba(0,8,0,.12)'; c.fillRect(0, 0, W, H);
        drop.forEach((y, i) => {
          const ch = chars[Math.floor(R() * chars.length)];
          c.fillStyle = '#8dff9a'; c.fillText(ch, i * S, y * S);
          c.fillStyle = '#18c030'; c.fillText(chars[Math.floor(R() * chars.length)], i * S, (y - 1) * S);
          drop[i] = y * S > H && R() > .975 ? 0 : y + 1;
        });
      };
    }
  },
  warp: {
    name: 'Warp Speed',
    make(c, W, H) {
      const stars = Array.from({length: 260}, () => ({x: (R() - .5) * W * 2, y: (R() - .5) * H * 2, z: R() * W}));
      return () => {
        c.fillStyle = 'rgba(0,0,10,.35)'; c.fillRect(0, 0, W, H);
        stars.forEach((s) => {
          const px = s.x / s.z * W / 2 + W / 2, py = s.y / s.z * W / 2 + H / 2; s.z -= 9;
          if (s.z < 1 || px < 0 || px > W || py < 0 || py > H) { s.x = (R() - .5) * W * 2; s.y = (R() - .5) * H * 2; s.z = W; return; }
          const qx = s.x / (s.z + 14) * W / 2 + W / 2, qy = s.y / (s.z + 14) * W / 2 + H / 2, a = 1 - s.z / W;
          c.strokeStyle = 'rgba(210,225,255,' + (.25 + a * .75) + ')'; c.lineWidth = .6 + a * 2; c.beginPath(); c.moveTo(qx, qy); c.lineTo(px, py); c.stroke();
        });
      };
    }
  },
  disks: {
    name: 'Flying Disks',
    make(c, W, H) {
      const mk = (fresh) => ({x: fresh ? R() * (W + 200) : W + 40 + R() * 200, y: fresh ? R() * H - 100 : -60 - R() * 200, v: 1.4 + R() * 1.4, ph: R() * 6.28, s: .8 + R() * .7});
      const fl = Array.from({length: 9}, () => mk(true)); let n = 0;
      const wing = (x, y, side, ph, s) => {
        const a = Math.sin(ph) * .8; c.save(); c.translate(x, y); c.scale(side, 1); c.rotate(-.5 + a);
        c.fillStyle = '#f4f6fb'; c.strokeStyle = '#8c96ad'; c.lineWidth = 1; c.beginPath(); c.ellipse(20 * s, -2 * s, 22 * s, 8 * s, -.2, 0, 6.283); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(6 * s, -2 * s); c.lineTo(36 * s, -4 * s); c.moveTo(6 * s, 1 * s); c.lineTo(34 * s, 0); c.stroke(); c.restore();
      };
      return () => {
        n++; c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
        fl.forEach((f, i) => {
          f.x -= f.v * 1.15; f.y += f.v * .8; f.ph += .22; if (f.x < -120 || f.y > H + 80) fl[i] = mk(false);
          const s = f.s, x = f.x, y = f.y;
          wing(x - 4 * s, y - 2 * s, -1, f.ph, s); wing(x + 28 * s, y - 2 * s, 1, f.ph, s);
          c.fillStyle = '#2a4bd6'; c.fillRect(x, y, 30 * s, 30 * s); c.fillStyle = '#c9ced9'; c.fillRect(x + 7 * s, y, 16 * s, 11 * s); c.fillStyle = '#2a4bd6'; c.fillRect(x + 17 * s, y + 2 * s, 4 * s, 7 * s);
          c.fillStyle = '#f2f4f8'; c.fillRect(x + 4 * s, y + 16 * s, 22 * s, 12 * s); c.fillStyle = '#d33'; c.fillRect(x + 4 * s, y + 16 * s, 22 * s, 3 * s);
        });
      };
    }
  }
};
