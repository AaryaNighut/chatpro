"use client";
import { useState } from "react";

export default function Page() {
    const [response, setResponse] = useState("");

    const callBackend = async() => {
        try {
            const res = await fetch("https://your-backend-url.com/api"); // 🔁 replace
            const data = await res.json();
            setResponse(JSON.stringify(data));
        } catch (err) {
            console.log(err);
        }
    };

    return ( <
        div style = {
            { padding: "20px" } } >

        { /* HOME */ } <
        section >
        <
        h1 > ChatPro🚀 < /h1> <
        p > AI Powered Platform < /p> <
        /section>

        { /* SERVICES */ } <
        section >
        <
        h2 > Services < /h2> <
        ul >
        <
        li > AI Chatbot < /li> <
        li > Healthcare Assistant < /li> <
        li > Real - time Messaging < /li> <
        /ul> <
        /section>

        { /* ABOUT */ } <
        section >
        <
        h2 > About < /h2> <
        p > This project connects frontend with AWS backend. < /p> <
        /section>

        { /* CONTACT */ } <
        section >
        <
        h2 > Contact < /h2> <
        p > Email: support @chatpro.com < /p> <
        /section>

        { /* LOGIN */ } <
        section >
        <
        h2 > Login < /h2> <
        input placeholder = "Username" / > < br / > < br / >
        <
        input type = "password"
        placeholder = "Password" / > < br / > < br / >
        <
        button > Login < /button> <
        /section>

        { /* BACKEND TEST */ } <
        section >
        <
        h2 > Backend Test < /h2> <
        button onClick = { callBackend } > Call Backend < /button> <
        p > { response } < /p> <
        /section>

        <
        /div>
    );
}