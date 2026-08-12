import { useState } from "react";
import { Button } from "./components/ui/button";
import axios from "axios";

const Backend_URL = "http://localhost:3000";

// One component for both pages. Signup returns an id and drops you on the signin
// page; signin returns the token the rest of the app uses.
export function Auth({ onSignedIn } : { onSignedIn : (token : string) => void }) {
  const [mode, setMode] = useState<"signup" | "signin">("signin");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  async function submit(){
    setMessage("");
    try{
      if(mode === "signup"){
        const response = await axios.post(`${Backend_URL}/signup`, { username, password });
        setMode("signin");
        setPassword("");
        setMessage(`account created (id ${response.data.id}) — now sign in`);
      }else{
        const response = await axios.post(`${Backend_URL}/signin`, { username, password });
        localStorage.setItem("token", response.data.token);
        localStorage.setItem("username", response.data.username);
        onSignedIn(response.data.token);
      }
    }catch(err : any){
      setMessage(err.response?.data?.message ?? "something went wrong");
    }
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center">
      <div className="w-80 border rounded p-6">
        <div className="font-semibold mb-4">
          { mode === "signup" ? "Sign up" : "Sign in" }
        </div>

        <input
          className="w-full border rounded p-2 mb-2"
          placeholder="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <input
          className="w-full border rounded p-2 mb-4"
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if(e.key === "Enter") submit() }}
        />

        <Button className="w-full" onClick={submit}>
          { mode === "signup" ? "Create account" : "Sign in" }
        </Button>

        <div className="mt-3 text-sm">
          <button
            className="underline"
            onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setMessage("") }}
          >
            { mode === "signup" ? "Already have an account? Sign in" : "No account? Sign up" }
          </button>
        </div>

        { message && <div className="mt-3 text-sm text-red-800">{ message }</div> }
      </div>
    </div>
  );
}

export default Auth;
