"use client";

import { useEffect, useRef } from "react";

const VERT = "attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}";

const FRAG = `
precision highp float;
uniform vec2 uRes;uniform float uTime;uniform vec2 uMouse;uniform float uScroll;uniform float uTheme;
float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);
 return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),
                mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
            mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),
                mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z);}
float fbm(vec3 p){float a=.5,r=0.;for(int i=0;i<3;i++){r+=a*noise(p);p*=2.02;a*=.5;}return r;}
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float map(vec3 p){
 float t=uTime*.22;vec3 q=p;
 q.xz*=rot(t*.6+uMouse.x*.9);q.xy*=rot(uMouse.y*.55);
 float base=length(q)-1.05;
 float n=fbm(q*1.7+vec3(0.,t*1.1,t*.7));
 float ripple=.05*sin(q.x*7.+t*4.)*sin(q.y*6.-t*3.);
 return (base+(n-.5)*.62+ripple)*.55;}
vec3 norm(vec3 p){vec2 e=vec2(.003,0.);
 return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));}
vec3 azure(float t){return .5+.5*cos(6.28318*(t+vec3(.58,.30,.16)));}
vec3 background(vec2 uv,float s){
 vec3 col=mix(vec3(.031,.031,.047),vec3(.949,.949,.961),uTheme);
 vec3 wash=azure(uv.y*.25+s*.6+.55)*(1.-clamp(length(uv),0.,1.)*.7);
 col+=mix(.025*wash,-.05*wash,uTheme);
 return col;}
void main(){
 vec2 uv=(gl_FragCoord.xy-.5*uRes)/min(uRes.x,uRes.y);
 float s=uScroll;
 vec2 drift=vec2(sin(s*4.2)*1.05,cos(s*3.1)*.38-.05);
 float dist=3.2+1.1*sin(s*3.14159)-1.2*smoothstep(.85,1.,s);
 vec3 ro=vec3(drift.x,drift.y,dist);
 vec3 rd=normalize(vec3(uv,-1.6));
 float tt=0.,dmin=1e3,hit=-1.;
 for(int i=0;i<36;i++){
  vec3 p=ro+rd*tt;float d=map(p);
  dmin=min(dmin,d);
  if(d<.002){hit=tt;break;}
  tt+=d;if(tt>8.)break;}
 vec3 col=background(uv,s);
 if(hit>0.){
  vec3 p=ro+rd*hit;vec3 n=norm(p);
  float fre=pow(1.-max(dot(n,-rd),0.),3.);
  float m=fbm(p*1.4+uTime*.18);
  vec2 disp=n.xy*(.30+.20*m);
  vec3 through;
  through.r=background(uv+disp*1.10,s).r;
  through.g=background(uv+disp,s).g;
  through.b=background(uv+disp*.90,s).b;
  vec3 l=normalize(vec3(.6,.8,.5));
  vec3 l2=normalize(vec3(-.5,-.2,.6));
  float sp1=pow(max(dot(reflect(-l,n),-rd),0.),70.);
  float sp2=pow(max(dot(reflect(-l2,n),-rd),0.),22.);
  vec3 rim=azure(fre*1.4+m*.7+s*.5);
  rim=mix(rim,vec3(0.,.83,1.),.22);
  vec3 darkCol=through*vec3(.80,.88,.97)+rim*fre*1.25+(sp1+sp2*.35)*vec3(.85,.95,1.);
  vec3 lightCol=through*vec3(.98,1.0,1.05)+rim*fre*.8+(sp1+sp2*.3)*vec3(1.);
  col=mix(darkCol,lightCol,uTheme);
 }else{
  float glow=pow(max(0.,1.-dmin*1.2),6.);
  col+=mix(vec3(0.,.83,1.)*glow*.2,-vec3(.10,.22,.34)*glow*.32,uTheme);
 }
 col*=1.-.35*pow(length(uv*vec2(.8,1.)),2.2)*mix(1.,.3,uTheme);
 gl_FragColor=vec4(col,1.);}`;

const FRAME_MS = 1000 / 120;

export default function FluidBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext("webgl", {
      antialias: false,
      alpha: false,
      depth: false,
      stencil: false,
      powerPreference: "low-power",
    });
    if (!gl) {
      canvas.style.display = "none";
      return;
    }

    const compile = (type: number, src: string) => {
      const shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) return null;
      return shader;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) {
      canvas.style.display = "none";
      return;
    }
    const program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.useProgram(program);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "p");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    const uniforms: Record<string, WebGLUniformLocation | null> = {};
    ["uRes", "uTime", "uMouse", "uScroll", "uTheme"].forEach((name) => {
      uniforms[name] = gl.getUniformLocation(program, name);
    });

    let raf = 0;
    let running = true;
    let lastFrame = -FRAME_MS;
    let mx = 0;
    let my = 0;
    let tMX = 0;
    let tMY = 0;
    let sp = 0;
    let theme = document.documentElement.classList.contains("light") ? 1 : 0;
    let themeTarget = theme;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const resize = () => {
      const scale = window.innerWidth < 768 ? 0.42 : 0.6;
      canvas.width = Math.max(2, Math.floor(window.innerWidth * scale));
      canvas.height = Math.max(2, Math.floor(window.innerHeight * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    };
    resize();
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const onResize = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 160);
    };
    window.addEventListener("resize", onResize);

    const onPointerMove = (event: PointerEvent) => {
      tMX = (event.clientX / window.innerWidth) * 2 - 1;
      tMY = -((event.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onPointerMove, { passive: true });

    const themeObserver = new MutationObserver(() => {
      themeTarget = document.documentElement.classList.contains("light") ? 1 : 0;
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    const draw = (time: number) => {
      gl.uniform2f(uniforms.uRes, canvas.width, canvas.height);
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform2f(uniforms.uMouse, mx, my);
      gl.uniform1f(uniforms.uScroll, sp);
      gl.uniform1f(uniforms.uTheme, theme);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const t0 = performance.now();
    const tick = (now: number) => {
      if (!running) return;
      raf = requestAnimationFrame(tick);
      if (now - lastFrame < FRAME_MS) return;
      lastFrame = now;
      mx += (tMX - mx) * 0.045;
      my += (tMY - my) * 0.045;
      const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
      sp += (Math.min(Math.max(window.scrollY / maxScroll, 0), 1) - sp) * 0.07;
      theme += (themeTarget - theme) * 0.06;
      draw((now - t0) / 1000);
    };

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!reduced) {
        running = true;
        lastFrame = -FRAME_MS;
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    if (reduced) {
      draw(0);
    } else {
      raf = requestAnimationFrame(tick);
    }

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      if (resizeTimer) clearTimeout(resizeTimer);
      themeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 -z-10 h-full w-full"
    />
  );
}
