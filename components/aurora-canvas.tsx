"use client";

const ribbons = [
  { left: "3%", width: "8.5%", opacity: 0.42, delay: "0s", duration: "18s" },
  { left: "11%", width: "5.4%", opacity: 0.22, delay: "-5s", duration: "22s" },
  { left: "18%", width: "9.5%", opacity: 0.32, delay: "-2s", duration: "20s" },
  { left: "29%", width: "6.2%", opacity: 0.24, delay: "-9s", duration: "24s" },
  { left: "38%", width: "10.2%", opacity: 0.28, delay: "-4s", duration: "19s" },
  { left: "50%", width: "7.2%", opacity: 0.2, delay: "-11s", duration: "25s" },
  { left: "58%", width: "11.4%", opacity: 0.3, delay: "-7s", duration: "21s" },
  { left: "70%", width: "6.5%", opacity: 0.18, delay: "-3s", duration: "23s" },
  { left: "77%", width: "9.6%", opacity: 0.34, delay: "-10s", duration: "20s" },
  { left: "88%", width: "7.6%", opacity: 0.36, delay: "-6s", duration: "18s" },
];

export default function AuroraCanvas() {
  return (
    <div className="aurora-shell absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
      <div className="aurora-haze aurora-haze-top" />
      <div className="aurora-haze aurora-haze-center" />
      <div className="aurora-haze aurora-haze-edge" />
      {ribbons.map((ribbon, index) => (
        <span
          key={index}
          className="aurora-ribbon"
          style={{
            left: ribbon.left,
            width: ribbon.width,
            opacity: ribbon.opacity,
            animationDelay: ribbon.delay,
            animationDuration: ribbon.duration,
          }}
        />
      ))}
    </div>
  );
}
