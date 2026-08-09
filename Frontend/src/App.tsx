import "./index.css";
import { Button } from "./components/ui/button";
import { useRef, useState } from "react";
import axios from "axios";


const Backend_URL = "http://localhost:3000";


export function App() {
  const [selectedLanguage, setSelectedLanguage] = useState("CPP");
  const [status, setStatus] = useState("");
  const [output, setOutput] = useState("");
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  async function pollBackend(submissionId : string){
    while(true){
      const response = await axios.get(`${Backend_URL}/submission/${submissionId}`);
      const submission = response.data.submission;

      if(submission.submissionstatus !== 'processing'){
        setStatus(submission.submissionstatus)
        setOutput(submission.output ?? "")
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

      <div className="flex-1 h-screen bg-green-300">
          <div>
            { status }
          </div>
          <div>
            { output }
          </div>
        </div>
      
    </div>
  );
}

export default App;
