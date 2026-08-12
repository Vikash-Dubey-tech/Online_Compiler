import {createClient } from 'redis';
import fs from 'fs';
import { spawn } from 'child_process';
import  { prisma } from './db';

const client = createClient();
client.connect();  //connection to redis server


//the worker is strictly sequential, so a submission that never exits blocks every
//later one. 5s is the hard ceiling for both compiling and running user code.
const TIMEOUT_SECONDS = 5;
const TIMEOUT_MS = TIMEOUT_SECONDS * 1000;

//runs a spawned child to completion, or kills it once the limit is hit.
//Resolves with timedOut so the caller can tell a real exit from a kill - after a
//kill "close" still fires, just with a null exit code and a signal.
function runWithTimeout(child : ReturnType<typeof spawn>){
    return new Promise<{exitCode : number | null, timedOut : boolean}>(resolve=>{
        let timedOut = false;

        const timer = setTimeout(()=>{
            timedOut = true;
            child.kill();
        }, TIMEOUT_MS);

        child.on("close", (exitCode)=>{
            clearTimeout(timer); //without this the worker stays alive 5s past every submission
            resolve({exitCode, timedOut});
        })
    })
}

//exit code decides the status. stdout and stderr go to their own columns so the
//UI can render them as separate blocks.
async function finishSubmission(submissionId : string, exitCode : number | null, stdout : string, stderr : string){
    //a non-zero exit with nothing on either stream would otherwise show a blank panel
    const silentFailure = exitCode !== 0 && stdout.length === 0 && stderr.length === 0;
    await prisma.submission.update({
        where : {
            id : submissionId
        },
        data : {
            submissionstatus : exitCode === 0 ? "Success" : "Failure",
            output : stdout,
            stderr : silentFailure ? "process exited with code " + exitCode : stderr
        }
    })
}

async function failWithTimeout(submissionId : string, stdout : string, stderr : string, stage : string){
    //always note the kill - partial output with no marker reads like a completed run
    const note = "[time limit exceeded: " + stage + " killed after " + TIMEOUT_SECONDS + "s]";
    await prisma.submission.update({
        where : {
            id : submissionId
        },
        data : {
            submissionstatus : "TLE",
            output : stdout,
            stderr : stderr.length > 0 ? stderr + "\n" + note : note
        }
    })
}

while(true){
    const response = await client.rPop("Problems");
    if(!response){
        console.log("no data in the queue");
        await new Promise((r)=>setTimeout(r,1000));
        continue;
    }

    const parsedResponse = JSON.parse(response);
    const code = parsedResponse.code;
    const language = parsedResponse.language;
    const submissionId = parsedResponse.submissionID;
    console.log("processing the code for the user :" + submissionId);
    let finalResult = "";
    let errorResult = "";


    if(language === "CPP"){
        console.log("running user code in cpp");
       const filepath = __dirname + "/code/a.cpp";
       fs.writeFileSync(filepath, code); //sync wait till this line does not complete
       const responseCompiler = spawn("g++", [filepath, "-o", "./code/out"]); //async immediately go to next line
       let compileError = "";
       let exitCodeCompiler = null; 
       //await new Promise((r)=>setTimeout(r,2000)); // thats why we stop here for 2seconds
       
       //g++ writes its diagnostics to stderr, not stdout
       responseCompiler.stderr.on("data", (chunk)=>{
            compileError += chunk.toString();
       })

       //check error in compilation. "close" not "exit" - exit can fire before
       //stderr has drained, which would truncate the diagnostics we just captured
       const compileRun = await runWithTimeout(responseCompiler);
       exitCodeCompiler = compileRun.exitCode;

       //a pathological template or include bomb can hang g++ just as badly as an
       //infinite loop hangs the program
       if(compileRun.timedOut){
            await failWithTimeout(submissionId, "", compileError, "compilation");
            continue;
       }

       if(exitCodeCompiler !== 0){
            await finishSubmission(submissionId, exitCodeCompiler, "", compileError);
            continue;
       }

       const response = spawn("./code/out");  // is now updated for new code
       response.stdout.on("data", (chunk)=>{
            finalResult += chunk.toString();
       })
       //runtime diagnostics land here - aborts, uncaught throws, anything the
       //program itself writes to stderr
       response.stderr.on("data", (chunk)=>{
            errorResult += chunk.toString();
       })

       //save into db and update the status
       const run = await runWithTimeout(response);
       if(run.timedOut){
            await failWithTimeout(submissionId, finalResult, errorResult, "execution");
       }else{
            await finishSubmission(submissionId, run.exitCode, finalResult, errorResult);
       }
    }


    if(language === "js"){
        console.log("running user code in js");
        //await new Promise((r) => setTimeout(r,1000));
        const filepath = __dirname + "/code/a.js";
        fs.writeFileSync(filepath, code); //sync wait till this line does not complete
        const response = spawn("node", [filepath]);
    //     await new Promise<void>(resolve=>{
    //         responseCompiler.on("exit", async (exitcode)=>{
    //             //exitCodeCompiler = exitcode;
    //             if(exitcode !== 0){
    //                  await prisma.submission.update({
    //                     where : {
    //                         id : submissionId
    //                     },
    //                     data : {
    //                         submissionstatus : "Failure"
    //                     }
    //                 })
    //             }
    //         })
    //         resolve();
    //    })

        response.stdout.on("data", (chunk)=>{
            finalResult += chunk.toString();
        })
        //node prints uncaught exceptions and stack traces to stderr
        response.stderr.on("data", (chunk)=>{
            errorResult += chunk.toString();
        })


        const run = await runWithTimeout(response);
        if(run.timedOut){
            await failWithTimeout(submissionId, finalResult, errorResult, "execution");
        }else{
            await finishSubmission(submissionId, run.exitCode, finalResult, errorResult);
        }
    }
    if(language === "py"){
        console.log("running user code in python");
        //await new Promise((r) => setTimeout(r,1000));

        const filename = __dirname + "/code/a.py";
        fs.writeFileSync(filename,code);
        const response = spawn("python",[filename]);

        response.stdout.on("data", (chunk)=>{
            finalResult += chunk.toString();
        })
        //python prints tracebacks and SyntaxErrors to stderr
        response.stderr.on("data", (chunk)=>{
            errorResult += chunk.toString();
        })

        const run = await runWithTimeout(response);
        if(run.timedOut){
            await failWithTimeout(submissionId, finalResult, errorResult, "execution");
        }else{
            await finishSubmission(submissionId, run.exitCode, finalResult, errorResult);
        }
    }

}