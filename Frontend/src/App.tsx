import "./index.css";
import { Button } from "./components/ui/button";
import { useRef, useState } from "react";
import axios from "axios";
import { Auth } from "./Auth";


const Backend_URL = "http://localhost:3000";

type Submission = {
  id : string;
  code : string;
  language : string;
  submissionstatus : string | null;
  output : string | null;
  stderr : string | null;
  createdAt : string;
};


export function App() {
  const [token, setToken] = useState(localStorage.getItem("token") ?? "");
  const [selectedLanguage, setSelectedLanguage] = useState("CPP");
  const [status, setStatus] = useState("");
  const [output, setOutput] = useState("");
  const [stderr, setStderr] = useState("");
  const [history, setHistory] = useState<Submission[] | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);

  //every protected route reads the token from this header
  const authHeader = { headers : { Authorization : `Bearer ${token}` } };

  if(!token){
    return <Auth onSignedIn={setToken} />;
  }

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

  async function getHistory(){
    const response = await axios.get(`${Backend_URL}/history`, authHeader);
    setHistory(response.data.submissions);
  }

  function signOut(){
    localStorage.removeItem("token");
    localStorage.removeItem("username");
    setToken("");
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
            <Button variant="outline" onClick={getHistory}>
              Get History
            </Button>
            <Button variant="outline" onClick={signOut}>
              Sign out ({ localStorage.getItem("username") })
            </Button>
            <Button onClick={async() => {
              setStatus("Processing");
              setOutput("");
              setStderr("");
              setHistory(null);

              const response = await axios.post(`${Backend_URL}/submission`, {
                "code" : textAreaRef.current!.value,
                language : selectedLanguage
              }, authHeader)

              pollBackend(response.data.id)
            }}>
              Submit
            </Button>
          </div>
        </div>
        <textarea placeholder="Enter your code here..." ref ={textAreaRef} className=" h-screen w-full border rounded m-4 p-4" rows={500}></textarea>

      </div>

      <div className="flex-1 h-screen m-4 p-4 border rounded overflow-auto bg-green-300">
          { history === null ? (
            <>
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
            </>
          ) : (
            <>
              <div className="font-semibold mb-2">
                History ({ history.length })
              </div>
              { history.length === 0 && <div className="text-sm">no submissions yet</div> }
              { history.map((submission) => (
                <div key={submission.id} className="border rounded p-2 mb-2 text-sm">
                  <div className="font-semibold">
                    { submission.language } — { submission.submissionstatus } — { new Date(submission.createdAt).toLocaleString() }
                  </div>
                  <pre className="mt-1 whitespace-pre-wrap break-words font-mono">
                    { submission.code }
                  </pre>
                  { submission.output && (
                    <pre className="mt-1 whitespace-pre-wrap break-words font-mono">
                      { submission.output }
                    </pre>
                  )}
                  { submission.stderr && (
                    <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-red-800">
                      { submission.stderr }
                    </pre>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      
    </div>
  );
}

export default App;
