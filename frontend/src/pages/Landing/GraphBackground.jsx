import { useEffect, useRef } from 'react';

export default function GraphBackground() {
  const canvasRef = useRef(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;
    let w, h;

    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    const NODE_COUNT = 55;
    const nodes = Array.from({ length: NODE_COUNT }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.4,
      vy: (Math.random() - 0.5) * 0.4,
      r: Math.random() * 1.5 + 0.8,
      pulse: Math.random() * Math.PI * 2,
    }));

    const GRID_COLS = 12;
    const GRID_ROWS = 8;
    const MAX_DIST = 160;
    let frame = 0;

    const draw = () => {
      animId = requestAnimationFrame(draw);
      ctx.clearRect(0, 0, w, h);
      frame++;

      // Grid lines
      ctx.save();
      ctx.strokeStyle = 'rgba(137,206,255,0.035)';
      ctx.lineWidth = 1;
      for (let col = 0; col <= GRID_COLS; col++) {
        const x = (col / GRID_COLS) * w;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let row = 0; row <= GRID_ROWS; row++) {
        const y = (row / GRID_ROWS) * h;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(137,206,255,0.06)';
      for (let col = 0; col <= GRID_COLS; col += 3) {
        const x = (col / GRID_COLS) * w;
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
      }
      for (let row = 0; row <= GRID_ROWS; row += 3) {
        const y = (row / GRID_ROWS) * h;
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
      }
      ctx.fillStyle = 'rgba(137,206,255,0.08)';
      for (let col = 0; col <= GRID_COLS; col++) {
        for (let row = 0; row <= GRID_ROWS; row++) {
          ctx.beginPath();
          ctx.arc((col / GRID_COLS) * w, (row / GRID_ROWS) * h, 1.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();

      // Move nodes
      for (const n of nodes) {
        n.x += n.vx; n.y += n.vy; n.pulse += 0.02;
        if (n.x < 0 || n.x > w) n.vx *= -1;
        if (n.y < 0 || n.y > h) n.vy *= -1;
      }

      // Edges
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < MAX_DIST) {
            ctx.save();
            ctx.strokeStyle = `rgba(137,206,255,${(1 - dist / MAX_DIST) * 0.12})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.stroke();
            ctx.restore();
          }
        }
      }

      // Nodes
      for (const n of nodes) {
        const glowAlpha = 0.25 + 0.15 * Math.sin(n.pulse);
        const grad = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, n.r * 5);
        grad.addColorStop(0, `rgba(137,206,255,${glowAlpha})`);
        grad.addColorStop(1, 'rgba(137,206,255,0)');
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r * 5, 0, Math.PI * 2);
        ctx.fillStyle = grad; ctx.fill();
        ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(137,206,255,${0.4 + 0.3 * Math.sin(n.pulse)})`;
        ctx.fill();
      }

      // Data pulse
      if (frame % 90 === 0) {
        const i = Math.floor(Math.random() * nodes.length);
        const j = Math.floor(Math.random() * nodes.length);
        if (i !== j) {
          const dx = nodes[j].x - nodes[i].x;
          const dy = nodes[j].y - nodes[i].y;
          if (Math.sqrt(dx * dx + dy * dy) < MAX_DIST * 1.5) {
            const px = nodes[i].x + dx * ((frame % 90) / 90);
            const py = nodes[i].y + dy * ((frame % 90) / 90);
            ctx.beginPath(); ctx.arc(px, py, 2.5, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(189,194,255,0.7)'; ctx.fill();
          }
        }
      }
    };

    draw();
    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full pointer-events-none"
      style={{ zIndex: 0 }}
    />
  );
}
