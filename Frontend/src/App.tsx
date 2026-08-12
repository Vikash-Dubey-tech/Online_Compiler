import "./index.css";
import { Button } from "./components/ui/button";
import { useRef, useState } from "react";
import axios from "axios";


const Backend_URL = "http://localhost:3000";


export function App() {
  const [selectedLanguage, setSelectedLanguage] = useState("CPP");
  const [status, setStatus] = useState("");
  const [output, setOutput] = useState("");
  const [stderr, setStderr] = useState("");
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  async function pollBackend(submissionId : string){
    while(true){
      const response = await axios.get(`${Backend_URL}/submission/${submissionId}`);
      const submission = response.data.submission;

      if(submission.submissionstatus !== 'processing'){
        setStatus(submission.submissionstatus)
        setOutput(submission.output ?? "")
        setStderr(submission.stderr ?? "")
        return;
      }
      await new Promise(r=>setTimeout(r,1000));
    }
  }

  return (
    <div className="flex h-screen w-screen flex m-4">
      <div className="flex-1 h-screen">
        <div className="flex justify-between rounded">
          <div>
            <Button variant={selectedLanguage === "CPP" ? "destructive" : "outline"} onClick={() => { setSelectedLanguage("CPP") }}>
              CPP
            </Button>
            <Button variant={selectedLanguage === "js" ? "destructive" : "outline"} onClick={() => { setSelectedLanguage("js") }}>
              JS
            </Button>
            <Button variant={selectedLanguage === "py" ? "destructive" : "outline"} onClick={() => { setSelectedLanguage("py") }}>
              Python
            </Button>
          </div>

          <div>
            <Button onClick={async() => {
              setStatus("Processing");
              setOutput("");
              setStderr("");

              const response = await axios.post(`${Backend_URL}/submission`, {
                "code" : textAreaRef.current!.value,
                language : selectedLanguage
              })

              pollBackend(response.data.id)
            }}>
              Submit
            </Button>
          </div>
        </div>
        <textarea placeholder="Enter your code here..." ref ={textAreaRef} className=" h-screen w-full border rounded m-4 p-4" rows={500}></textarea>

      </div>

      <div className="flex-1 h-screen m-4 p-4 border rounded overflow-auto bg-green-300">
          <div className="font-semibold">
            { status }
          </div>
          {/* pre + whitespace-pre-wrap: output is multi-line (stack traces,
              compiler diagnostics) and a plain div collapses it to one line */}
          <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-sm">
            { output }
          </pre>
          { stderr && (
            <pre className="mt-2 whitespace-pre-wrap break-words font-mono text-sm text-red-800">
              { stderr }
            </pre>
          )}
        </div>
      
    </div>
  );
}

export default App;
