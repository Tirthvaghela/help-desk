// Two-panel card for the customer sign-in and sign-up pages, in the same style as StaffLogin.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#c5e6d7] px-4 py-10 sm:px-6">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 50% 0%, rgba(33,165,125,0.45), transparent 48%),
            radial-gradient(ellipse at 0% 100%, rgba(130,190,245,0.6), transparent 55%),
            radial-gradient(ellipse at 100% 100%, rgba(191,208,255,0.7), transparent 55%),
            linear-gradient(145deg, #d4ecdb, #e8f4f3 55%, #dce9fb)
          `,
        }}
      />

      <div className="relative z-10 grid w-full max-w-[1050px] overflow-hidden rounded-[30px] border border-white/80 bg-white/75 shadow-[0_25px_80px_rgba(39,82,75,0.13)] backdrop-blur-2xl md:grid-cols-2">
        <div className="flex flex-col justify-between gap-10 bg-gradient-to-br from-[#dcefe5]/80 to-[#e8f1fa]/80 p-7 sm:p-10 md:min-h-[600px] md:p-12">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-[13px] bg-[#172d2a]">
              <span className="h-4 w-4 rounded-full bg-[#83dcb2]" />
            </span>
            <span className="text-[19px] font-semibold tracking-[-0.5px] text-[#172d2a]">Help Desk</span>
          </div>

          <div>
            <span className="mb-5 inline-block rounded-full border border-[#badbca] bg-white/55 px-4 py-2 text-[11px] font-semibold uppercase tracking-[1.5px] text-[#3b8165]">
              Customer Support
            </span>
            <h1 className="max-w-[420px] text-[34px] font-semibold leading-[1.13] tracking-[-1.5px] text-[#172d2a] sm:text-[42px]">
              Ask for help,
              <br />
              follow every reply.
            </h1>
            <p className="mt-6 max-w-[380px] text-[14px] leading-7 text-[#5b746c]">
              Raise a support ticket, see its status at a glance, and keep the whole conversation
              with our team in one place.
            </p>
          </div>

          <p className="hidden text-[12px] text-[#7b9489] md:block">Organized support. Better experiences.</p>
        </div>

        <div className="flex flex-col justify-center bg-white/85 p-7 sm:p-10 md:p-12">
          <div className="mb-8">
            <h2 className="text-[29px] font-semibold tracking-[-1px] text-[#1d302d]">{title}</h2>
            <p className="mt-2 text-[13px] leading-relaxed text-[#7b8f88]">{subtitle}</p>
          </div>

          {children}

          {footer && (
            <div className="mt-8 border-t border-[#edf1ee] pt-6 text-center text-[12px] text-[#6f857b]">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
