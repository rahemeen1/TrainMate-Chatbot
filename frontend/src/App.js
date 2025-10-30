import Home from "./components/Home";
import SuperAdmin from "./components/SuperAdmin";
import { useState } from "react";

export default function App() {
  const [open, setOpen] = useState(true);

  return (
    <>
      {/* <Home /> */}
      <SuperAdmin isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
