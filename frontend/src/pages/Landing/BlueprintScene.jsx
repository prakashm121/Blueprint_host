import { useEffect } from 'react';
import * as THREE from 'three';

export default function BlueprintScene({ containerRef }) {
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    let w = el.clientWidth || 1;
    let h = el.clientHeight || 1;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
    camera.position.set(0, 3, 8);
    camera.lookAt(0, 1, 0);

    const blueprintGroup = new THREE.Group();

    // Floor Grid
    const gridHelper = new THREE.GridHelper(14, 24, 0x0ea5e9, 0x1e293b);
    gridHelper.material.transparent = true;
    gridHelper.material.opacity = 0.12;
    blueprintGroup.add(gridHelper);

    // Materials
    const coreMat = new THREE.MeshPhongMaterial({ color: 0x89ceff, wireframe: true, transparent: true, opacity: 0.45 });
    const innerMat = new THREE.MeshPhongMaterial({ color: 0xbdc2ff, wireframe: true, transparent: true, opacity: 0.55 });

    // Core geometry — nested triangular shapes
    const outerCore  = new THREE.Mesh(new THREE.IcosahedronGeometry(2.4, 1), coreMat);
    const innerCore  = new THREE.Mesh(new THREE.OctahedronGeometry(1.6, 0),  innerMat);
    const innerCore2 = new THREE.Mesh(new THREE.TetrahedronGeometry(1.2, 0), coreMat);
    const innerCore3 = new THREE.Mesh(new THREE.OctahedronGeometry(0.8, 0),  innerMat);

    // Torus rings
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x89ceff, transparent: true, opacity: 0.3 });
    const ring1 = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.04, 6, 48), ringMat);
    const ring2 = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.03, 6, 48), ringMat);
    ring1.rotation.x = Math.PI / 2.5;
    ring2.rotation.x = Math.PI / 1.4;
    ring2.rotation.z = Math.PI / 4;

    blueprintGroup.add(outerCore, innerCore, innerCore2, innerCore3, ring1, ring2);

    // Floating Nodes
    const nodeGeo   = new THREE.SphereGeometry(0.12, 8, 8);
    const nodeMat   = new THREE.MeshBasicMaterial({ color: 0x89ceff });
    const accentMat = new THREE.MeshBasicMaterial({ color: 0xbdc2ff });
    const nodes = [];

    for (let i = 0; i < 18; i++) {
      const node = new THREE.Mesh(nodeGeo, i % 3 === 0 ? accentMat : nodeMat);
      const angle  = (i / 18) * Math.PI * 2;
      const radius = 3.2 + Math.random() * 2.0;
      node.position.set(Math.cos(angle) * radius, 0.5 + Math.random() * 3.5, Math.sin(angle) * radius);
      node.userData = { angle, radius, speed: 0.18 + Math.random() * 0.28, offset: Math.random() * Math.PI * 2 };
      blueprintGroup.add(node);
      nodes.push(node);
    }

    // Connection Lines
    const lineMat = new THREE.LineBasicMaterial({ color: 0x89ceff, transparent: true, opacity: 0.13 });
    const lines = [];
    nodes.forEach((n, i) => {
      if (i > 0) {
        const geo  = new THREE.BufferGeometry().setFromPoints([n.position, nodes[i - 1].position]);
        const line = new THREE.Line(geo, lineMat);
        blueprintGroup.add(line);
        lines.push({ line, a: n, b: nodes[i - 1] });
      }
    });
    const loopGeo  = new THREE.BufferGeometry().setFromPoints([nodes[nodes.length - 1].position, nodes[0].position]);
    const loopLine = new THREE.Line(loopGeo, lineMat);
    blueprintGroup.add(loopLine);
    lines.push({ line: loopLine, a: nodes[nodes.length - 1], b: nodes[0] });

    blueprintGroup.position.set(0, 0, 0);
    scene.add(blueprintGroup);

    // Lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const pl1 = new THREE.PointLight(0x89ceff, 2.5, 30); pl1.position.set(6, 6, 4);  scene.add(pl1);
    const pl2 = new THREE.PointLight(0xbdc2ff, 1.2, 20); pl2.position.set(-6, 2, -4); scene.add(pl2);

    const mouse = { x: 0, y: 0 };
    const onMove = (e) => {
      mouse.x = (e.clientX / window.innerWidth  - 0.5) * 2;
      mouse.y = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener('mousemove', onMove);

    const resizeObserver = new ResizeObserver(() => {
      const nw = el.clientWidth, nh = el.clientHeight;
      if (!nw || !nh) return;
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    });
    resizeObserver.observe(el);

    const clock = new THREE.Clock();
    let animId;
    const animate = () => {
      animId = requestAnimationFrame(animate);
      const t = clock.getElapsedTime();

      blueprintGroup.rotation.y = t * 0.09;
      outerCore.rotation.x  = t * 0.13;  outerCore.rotation.z  = t * 0.05;
      innerCore.rotation.z  = -t * 0.22; innerCore.rotation.x  = t * 0.1;
      innerCore2.rotation.y = t * 0.3;   innerCore2.rotation.z = t * 0.15;
      innerCore3.rotation.x = -t * 0.25; innerCore3.rotation.y = -t * 0.2;
      ring1.rotation.z = t * 0.12;
      ring2.rotation.y = -t * 0.09;

      outerCore.position.y  = 1.5 + Math.sin(t * 1.0) * 0.3;
      innerCore.position.y  = 1.5 + Math.sin(t * 1.0 + 0.5) * 0.2;
      innerCore2.position.y = 1.5 + Math.sin(t * 1.2 + 0.8) * 0.25;
      innerCore3.position.y = 1.5 + Math.sin(t * 0.8 + 0.2) * 0.15;
      ring1.position.y = 1.5 + Math.sin(t * 1.0) * 0.3;
      ring2.position.y = 1.5 + Math.sin(t * 1.0) * 0.3;

      nodes.forEach(n => {
        n.userData.angle += n.userData.speed * 0.01;
        n.position.x = Math.cos(n.userData.angle) * n.userData.radius;
        n.position.z = Math.sin(n.userData.angle) * n.userData.radius;
        n.position.y = 2 + Math.sin(t + n.userData.offset) * 0.7;
      });
      lines.forEach(l => l.line.geometry.setFromPoints([l.a.position, l.b.position]));

      camera.position.x += (mouse.x * 2.0 - camera.position.x) * 0.04;
      camera.position.y += (-mouse.y * 1.2 + 3 - camera.position.y) * 0.04;
      camera.lookAt(0, 1, 0);

      renderer.render(scene, camera);
    };
    animate();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMove);
      resizeObserver.disconnect();
      renderer.dispose();
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement);
    };
  }, [containerRef]);

  return null;
}
