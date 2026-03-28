import React from "react";

export default function CompanyPageLoader({
  message = "Loading...",
  layout = "page",
}) {
  const loader = (
    <div className="flex flex-col items-center gap-4">
      <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-blue-400" />
      <p className="text-lg font-semibold text-blue-100">{message}</p>
      <p className="text-sm text-blue-200/80">Please wait, this may take a few seconds.</p>
    </div>
  );

  return (
    <div className="min-h-screen w-full bg-[#031C3A] text-white flex items-center justify-center p-10">
      {loader}
    </div>
  );
}
