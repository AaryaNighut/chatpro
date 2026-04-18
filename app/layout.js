import "./globals.css";

export default function RootLayout({ children }) {
    return ( <
        html >
        <
        body >
        <
        nav style = {
            { background: "green", color: "white", padding: "10px" }
        } >
        <
        h2 > ChatPro < /h2> < /
        nav >

        { children } <
        /body> < /
        html >
    );
}