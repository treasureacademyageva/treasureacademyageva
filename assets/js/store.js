/* Treasure Academy public brochure data.
   No accounts, pupils, results, payments, private staff contacts or form
   submissions belong in this browser file. */
const DB_KEY = "treasure_db_v5";
const SCHOOL_DEFAULTS = {
  name: "Treasure Academy, Ageva",
  levels: "Creche • Pre-Nursery • Nursery • Primary 1–6",
  motto: "Our God is able",
  address: "Opposite Morak Pure-Water Factory, Ageva, Okene, Kogi State",
  phone: "+234 814 194 3478",
  email: "treasuregroupofschool@gmail.com",
  hours: "Mon – Fri • 7:30am – 3:00pm",
  term: "",
  session: "",
  headName: "Mrs. Salihu Nanahawa",
  headTitle: "Headmistress",
  founder: "Shaibu Sidikat Ruth",
  founded: 2016,
  bank: {name:"",number:"",holder:""},
  fees: {},
  formFee: 0,
  headDob: "",
  resumeDate: "",
  emergency: {on:false,text:"",start:"",end:""},
  photoWeek: {src:"",cap:""},
  videoUrl: ""
};

const PUBLIC_NEWS = [
  {id:"NEA26",type:"news",title:"2026/2027 Admissions Are Open",date:"2026-09-15",link:"news/2026-2027-admissions-open.html",image:"assets/img/hero-kids.webp",text:"Admissions are open from Creche to Primary 6. Confirm the current process with the verified school office before paying."},
  {id:"NEV24",type:"video",title:"Watch: Treasure Academy Students Explore",date:"2024-12-10",link:"https://www.facebook.com/100093241642093/videos/538199732380350/",image:"assets/img/excursion-girls.jpg",text:"The existing website linked this school-excursion video on the school’s Facebook page."},
  {id:"NER24",type:"archive",title:"Excursion: Pupils Visit the Railway Station",date:"2024-12-04",link:"https://www.facebook.com/100093241642093/posts/460838207034230/",image:"assets/img/excursion-railway.webp",text:"A one-day learning excursion recorded in the school’s existing website archive."},
  {id:"NES24",type:"archive",title:"Excursion: Learning Beyond the Classroom",date:"2024-12-04",link:"https://www.facebook.com/100093241642093/posts/460833623701355/",image:"assets/img/excursion-shop.webp",text:"The school’s existing archive links to photographs from the 2024 learning excursion."},
  {id:"NEG5",type:"archive",title:"5th Graduation Ceremony",date:"2021-08-12",link:"news/2021-fifth-graduation-ceremony.html",image:"assets/img/graduation.webp",text:"The school archive records a post-pandemic graduation and an important Common Entrance centre milestone."},
  {id:"NEG4",type:"archive",title:"4th Graduation Ceremony",date:"2020-08-07",link:"news/2020-fourth-graduation-ceremony.html",image:"assets/img/graduation.webp",text:"The school community found a way to recognise its graduands during the Covid-19 period."},
  {id:"NEG3",type:"archive",title:"3rd Graduation Ceremony",date:"2019-08-06",link:"news/2019-third-graduation-ceremony.html",image:"assets/img/graduation.webp",text:"The archive celebrates the third graduating set and their preparation for the next stage."},
  {id:"NEG2",type:"archive",title:"2nd Graduation Ceremony",date:"2018-07-24",link:"news/2018-second-graduation-ceremony.html",image:"assets/img/graduation.webp",text:"The second school graduation celebrated another set of pupils and the school's continued growth."},
  {id:"NEG1",type:"archive",title:"1st Graduation Ceremony",date:"2017-07-26",link:"news/2017-first-graduation-ceremony.html",image:"assets/img/graduation.webp",text:"Treasure Academy's first full graduation ceremony celebrated six graduands and an early school milestone."}
];

const PUBLIC_DB = {
  school: SCHOOL_DEFAULTS,
  whatsapp: [{id:"W1",name:"School WhatsApp",role:"Verified school office contact",phone:"2349063932487"}],
  promotions: [{id:"PR1",badge:"Admissions Open",title:"2026/2027 Admission Is On",text:"Ask the school office about places from Creche to Primary 6 and confirm every payment instruction.",cta:"Admission Details",link:"admissions.html",color:"sun"}],
  newsEvents: PUBLIC_NEWS,
  classes: ["Creche","Pre-Nursery","Nursery 1","Nursery 2","Primary 1","Primary 2","Primary 3","Primary 4","Primary 5","Primary 6"],
  calendar: [], staffWall: [], formerTeachers: [], teachers: [], pupils: [], admins: [],
  results: [], registrations: [], applications: [], graduates: [], supportPledges: [],
  testimonials: [], exams: [], shopItems: [], lostfound: [], notices: [],
  transportRoutes: [], uniform: [], weekStrip: {on:false}
};

function publicClone(){ return JSON.parse(JSON.stringify(PUBLIC_DB)); }
function clearRetiredBrowserRecords(){
  [DB_KEY,"treasure_db_v4","treasure_db_v3","sunnydays_db_v2","sunnydays_db_v1",
   "treasure_session_v1","treasure_remember_v1","treasure_accounts_v1","treasure_otp_v1",
   "treasure_voted_ideas"].forEach(function(key){ try{ localStorage.removeItem(key); }catch(e){} });
}
function seedDB(){ return publicClone(); }
const DB = { load:function(){ clearRetiredBrowserRecords(); return publicClone(); } };

const U = {
  esc:function(value){
    return String(value==null?"":value).replace(/[&<>"']/g,function(char){
      return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[char];
    });
  },
  todayStr:function(){ return new Date().toISOString().slice(0,10); },
  shortDate:function(value){
    if(!value)return "";
    var date=new Date(String(value)+(/T/.test(String(value))?"":"T12:00:00"));
    return isNaN(date)?String(value):date.toLocaleDateString("en-GB",{day:"numeric",month:"short",year:"numeric"});
  },
  prettyDate:function(value){
    if(!value)return "";
    var date=new Date(String(value)+(/T/.test(String(value))?"":"T12:00:00"));
    return isNaN(date)?String(value):date.toLocaleDateString("en-GB",{weekday:"long",day:"numeric",month:"long",year:"numeric"});
  },
  naira:function(value){ return "₦"+Number(value||0).toLocaleString("en-NG"); },
  toast:function(message){
    var box=document.getElementById("toast");
    if(!box){ box=document.createElement("div");box.id="toast";document.body.appendChild(box); }
    box.textContent=String(message||"");box.classList.add("show");
    clearTimeout(box._timer);box._timer=setTimeout(function(){box.classList.remove("show");},2600);
  },
  icon:function(name,size){
    size=size||18;
    var path=name==="gift"?'<rect x="4" y="9" width="16" height="4" rx="1"/><path d="M6 13v7h12v-7M12 9v11M12 9S8 9 7 7.5 8.5 4.5 10 6s2 3 2 3zm0 0s4 0 5-1.5S15.5 4.5 14 6s-2 3-2 3z"/>':'<path d="M9 6l6 6-6 6"/>';
    return '<svg viewBox="0 0 24 24" width="'+size+'" height="'+size+'" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+path+'</svg>';
  },
  downloadFile:function(url,name){
    fetch(url).then(function(response){if(!response.ok)throw new Error("download");return response.blob();}).then(function(blob){
      var link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=name||"download";document.body.appendChild(link);link.click();link.remove();setTimeout(function(){URL.revokeObjectURL(link.href);},1000);
    }).catch(function(){window.open(url,"_blank","noopener");});
  }
};
clearRetiredBrowserRecords();
