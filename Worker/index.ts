import {createClient } from 'redis';
import fs from 'fs';
import { spawn } from 'child_process';
import  { prisma } from './db';

const client = createClient();
client.connect();  //connection to redis server

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


    if(language === "CPP"){
        console.log("running user code in cpp");
       const filepath = __dirname + "/code/a.cpp";
       fs.writeFileSync(filepath, code); //sync wait till this line does not complete
       const responseCompiler = spawn("g++", [filepath, "-o", "./code/out"]); //async immediately go to next line
       let exitCodeCompiler = null; 
       //await new Promise((r)=>setTimeout(r,2000)); // thats why we stop here for 2seconds
       
       //check error in compilation
       await new Promise<void>(resolve=>{
            responseCompiler.on("exit", async (exitCode)=>{
                exitCodeCompiler = exitCode;
                if(exitCode !== 0){
                     await prisma.submission.update({
                        where : {
                            id : submissionId
                        },
                        data : {
                            submissionstatus : "Failure"
                        }
                    })
                }
                resolve();
            })
       })

       if(exitCodeCompiler !== 0){
            continue;
       }

       const response = spawn("./code/out");  // is now updated for new code
       response.stdout.on("data", (chunk)=>{
            finalResult += chunk.toString();
       })

       //save into db and update the status
       await new Promise<void>(resolve=>{
            response.on("exit", async (exitCode)=>{
                if(exitCode == 0){
                    await prisma.submission.update({
                        where : {
                            id : submissionId
                        },
                        data : {
                            submissionstatus : "Success",
                            output : finalResult
                        }
                    })
                }else{
                    await prisma.submission.update({
                        where : {
                            id : submissionId
                        },
                        data : {
                            submissionstatus : "Failure"
                        }
                    })
                }
                resolve();
            })
        })
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


        await new Promise<void>(resolve=>{
            response.on("exit", async (exitCode)=>{
                if(exitCode == 0){
                    await prisma.submission.update({
                        where : {
                            id : submissionId
                        },
                        data : {
                            submissionstatus : "Success",
                            output : finalResult
                        }
                    })
                }else{
                    await prisma.submission.update({
                        where : {
                            id : submissionId
                        },
                        data : {
                            submissionstatus : "Failure"
                        }
                    })
                }
                resolve();
            })
        })
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

        await new Promise<void>(resolve =>{
            response.on("exit", async (exitCode)=>{
                if(exitCode == 0){
                    await prisma.submission.update({
                        where : {
                            id : submissionId
                        },
                        data : {
                            submissionstatus : "Success",
                            output : finalResult
                        }
                    })
                }else{
                    await prisma.submission.update({
                        where : {
                            id : submissionId
                        },
                        data : {
                            submissionstatus : "Failure"
                        }
                    })
                }
                resolve()
            })
        })
    }

}