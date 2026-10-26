import { useState } from "react";
import HelpDeskHeader from "../../components/common/helpdeskheader.jsx";
import AgentOverview from "../../components/agent/AgentOverview.jsx";
import AgentInbox from "../../components/agent/AgentInbox.jsx";

export default function AgentDashboard() {
  const [activePage, setActivePage] = useState("Overview");

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#b9dfd0] px-2 py-3 sm:px-5 sm:py-6 lg:px-10 lg:py-8">

      {/* BACKGROUND GRADIENT */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background: `
            radial-gradient(ellipse at 53% 2%, rgba(0, 157, 115, 0.85) 0%, transparent 39%),
            radial-gradient(ellipse at 8% 5%, rgba(188, 224, 171, 0.85) 0%, transparent 43%),
            radial-gradient(ellipse at 95% 15%, rgba(171, 220, 187, 0.85) 0%, transparent 45%),
            radial-gradient(ellipse at 8% 92%, rgba(121, 210, 251, 0.75) 0%, transparent 50%),
            radial-gradient(ellipse at 95% 100%, rgba(180, 199, 255, 0.80) 0%, transparent 55%),
            linear-gradient(145deg, #b8dec4 0%, #b5e6d8 48%, #d5e4fb 100%)
          `,
        }}
      />

      {/* SOFT COLOR GLOWS */}
      <div className="pointer-events-none absolute left-[25%] top-[15%] h-[350px] w-[350px] rounded-full bg-[#8de9c5]/35 blur-[100px]" />

      <div className="pointer-events-none absolute bottom-0 right-[10%] h-[400px] w-[400px] rounded-full bg-[#9ecbff]/35 blur-[110px]" />

      {/* OUTER GLASS CONTAINER */}
      <div className="relative z-10 mx-auto min-h-[calc(100vh-4rem)] min-w-0 max-w-[1500px] rounded-[22px] border border-white/70 bg-white/15 p-3 shadow-[0_20px_70px_rgba(31,76,65,0.12),inset_0_1px_0_rgba(255,255,255,0.65)] backdrop-blur-2xl sm:rounded-[28px] sm:p-5 lg:rounded-[32px] lg:p-6">

        {/* HEADER */}
        <HelpDeskHeader
          role="agent"
          activePage={activePage}
          onNavigate={setActivePage}
        />

        {/* INNER GLASS WORKSPACE */}
        <main className="mt-4 min-h-[75vh] min-w-0 rounded-[20px] border border-white/75 bg-white/15 p-3 shadow-[0_12px_40px_rgba(40,80,75,0.09),inset_0_1px_0_rgba(255,255,255,0.7)] backdrop-blur-2xl sm:rounded-[26px] sm:p-6 lg:rounded-[28px] lg:p-7">

          {/* PAGE HEADING */}
          <div className="mb-5 sm:mb-6">
            <h1 className="text-[23px] font-medium tracking-[-0.8px] text-[#1d302d] sm:text-[27px]">
              {activePage}
            </h1>

            <p className="mt-1.5 text-[13px] leading-relaxed text-[#536b65] sm:text-[14px]">
              {activePage === "Overview"
                ? "Stay organized, track ticket progress, and manage customer support efficiently."
                : "View, manage, and respond to customer support requests."}
            </p>
          </div>

          {/* OVERVIEW */}
          {activePage === "Overview" && <AgentOverview />}

          {/* INBOX */}
          {activePage === "Inbox" && <AgentInbox />}

        </main>
      </div>
    </div>
  );
}