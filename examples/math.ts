import {Vec3} from "vec3";



let v1 = new Vec3(10003.078632381407677, 0, 8.361332862549279);

let v2 = new Vec3(10002.9806618571945966,0, 8.358927821172559);

let angle = Math.acos(v1.dot(v2) / (v1.norm() * v2.norm()));

angle = (angle * 180) / Math.PI;
console.log(angle)