import express, { response } from 'express';
import axios from 'axios';
import { createClient } from 'redis';
import { prisma } from './db';
import cors from 'cors';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";


const client = createClient();
client.connect();  //connection to redis server


const app = express();

app.use(express.json());
app.use(cors());


//reads the "Authorization: Bearer <token>" header and returns the user id in it,
//or null if there is no usable token
function getUserId(req : express.Request){
    const header = req.headers.authorization;
    if(!header) return null;
    const token = header.replace("Bearer ", "");
    try{
        const payload = jwt.verify(token, JWT_SECRET) as { id : string };
        return payload.id;
    }catch{
        return null;
    }
}

app.post("/signup", async (req,res) =>{
    const username = req.body.username;
    const password = req.body.password;

    if(!username || !password){
        return res.status(400).json({ message : "username and password are required" });
    }

    //username is @unique, so a duplicate throws instead of creating a second row
    const existing = await prisma.user.findFirst({ where : { username : username } });
    if(existing){
        return res.status(409).json({ message : "username already taken" });
    }

    const user = await prisma.user.create({
        data : {
            username : username,
            //Bun hashes with argon2id - no extra dependency, and the column stays a plain String
            password : await Bun.password.hash(password)
        }
    })

    res.json({
        message : "signed up",
        id : user.id
    });
});

app.post("/signin", async (req,res) =>{
    const username = req.body.username;
    const password = req.body.password;

    const user = await prisma.user.findFirst({ where : { username : username } });
    //same response for unknown user and wrong password, so the endpoint does not
    //reveal which usernames exist
    if(!user || !(await Bun.password.verify(password, user.password))){
        return res.status(401).json({ message : "invalid username or password" });
    }

    res.json({
        message : "signed in",
        token : jwt.sign({ id : user.id }, JWT_SECRET),
        username : user.username
    });
});

//all submissions for the signed-in user, newest first
app.get("/history", async (req,res) =>{
    const userId = getUserId(req);
    if(!userId){
        return res.status(401).json({ message : "not signed in" });
    }

    const submissions = await prisma.submission.findMany({
        where : { userId : userId },
        orderBy : { createdAt : "desc" }
    })

    res.json({ submissions });
});

app.post("/submission", async (req,res) =>{
    const userId = getUserId(req);
    if(!userId){
        return res.status(401).json({ message : "not signed in" });
    }

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
            submissionstatus : "processing",
            userId : userId
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


