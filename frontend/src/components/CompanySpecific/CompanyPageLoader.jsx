import React from "react";

export default function CompanyPageLoader({
  message = "Loading...",
  layout = "content",
}) {
  const loader = (
    <div className="flex flex-col items-center justify-center gap-4">
      <svg
        className="animate-spin h-8 w-8 text-[#00FFFF]"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          d="M12 2C6.477 2 2 6.477 2 12h2a8 8 0 0116 0h2c0-5.523-4.477-10-10-10zm0 20c5.523 0 10-4.477 10-10h-2a8 8 0 01-16 0H2c0 5.523 4.477 10 10 10z"
        />
      </svg>
      <p className="text-base font-medium text-white">{message}</p>
    </div>
  );

  if (layout === "page") {
    return (
      <div className="min-h-screen bg-[#031C3A] text-white flex items-center justify-center p-10">
        {loader}
      </div>
    );
  }

  return (
    <div className="company-main-content flex-1 flex items-center justify-center p-10">
      {loader}
    </div>
  );
}
