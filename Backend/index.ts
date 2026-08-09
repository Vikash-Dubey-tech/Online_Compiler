import express, { response } from 'express';
import axios from 'axios';
import { createClient } from 'redis';
import { prisma } from './db';
import cors from 'cors';


const client = createClient();
client.connect();  //connection to redis server


const app = express();

app.use(express.json());
app.use(cors());


app.post("/signup", (req,res) =>{


});

app.post("/signin", (req,res) =>{
    
});

app.post("/submission", async (req,res) =>{
    const code = req.body.code;
    const language = req.body.language; 
    //contact with database -> q_id-> status: proccessing
    //contacct to worker ->cannot directly connec to worker why ??? if worker goes then our main backendd goes thats why we use redis as a queue
    // to connect with our worker we will use redis as a queue and we will push the data to redis and our worker will get the data from redis and
    //  process it and then we will get the result from redis and send it to the user
    //const reponse = await //connet to database and get reponse id;
    console.log("hi there");


    //put data into db postgres ad get reponse id as a submission id
    const response = await prisma.submission.create({
        data : {
            code : code,
            language : language,
            submissionstatus : "processing"
        }
    })

    client.lPush("Problems", JSON.stringify({submissionID : response.id, code, language})); //queue name is Problems and we are pushing the data to the queue
    res.json({
        message: "PROCESSing",
        id : response.id
    });

});

app.get("/submission/:id", async (req,res) =>{
    const response = await prisma.submission.findFirst({
        where : {
            id : req.params.id
        }
    })
    res.json({
        submission : response
    })
});


app.listen(3000, () =>{
    console.log("server is running on the port 3000");
});


