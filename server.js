require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({limit: '50mb'}));

app.get('/', (req,res)=>res.send('My AI Video Studio Backend Running ✅'));
app.get('/api/health', (req,res)=>{
  res.json({
    status: 'Backend Running ✅',
    REPLICATE_API_TOKEN: process.env.REPLICATE_API_TOKEN ? 'configured' : 'missing',
    SARVAM_API_KEY: process.env.SARVAM_API_KEY ? 'configured' : 'missing',
    GOOGLE_TTS_KEY: process.env.GOOGLE_TTS_KEY ? 'configured' : 'missing'
  });
});

function detectLanguage(text){
  if(/[\u0C80-\u0CFF]/.test(text)) return 'kn-IN';
  if(/[\u0C00-\u0C7F]/.test(text)) return 'te-IN';
  if(/[\u0900-\u097F]/.test(text)) return 'hi-IN';
  return 'en-IN';
}

app.post('/api/generate', async (req,res)=>{
  try{
    const {prompt, narration, language, format} = req.body;
    if(!prompt) return res.status(400).json({error:'prompt missing'});
    const detectedLang = language==='auto' || !language ? detectLanguage(prompt+' '+(narration||'')) : language;
    
    // TTS - Sarvam
    let audioBase64=null;
    if(process.env.SARVAM_API_KEY){
      try{
        const r = await axios.post('https://api.sarvam.ai/text-to-speech',{
          text: narration||prompt,
          target_language_code: detectedLang,
          speaker: 'anushka',
          model: 'bulbul:v1'
        },{headers:{'API-Subscription-Key':process.env.SARVAM_API_KEY}});
        audioBase64=r.data.audiodata || r.data.audio;
      }catch(e){ console.log('Sarvam Error', e.response?.data || e.message); }
    }

    // Video - Replicate
    let videoUrl=null;
    if(process.env.REPLICATE_API_TOKEN){
      const pred = await axios.post('https://api.replicate.com/v1/predictions',{
        version: "bytedance/seedance-1-lite",
        input:{prompt, aspect_ratio: format||'16:9', duration:5}
      },{headers:{Authorization:`Token ${process.env.REPLICATE_API_TOKEN}`}});
      
      let p=pred.data;
      while(p.status!=='succeeded' && p.status!=='failed'){
        await new Promise(r=>setTimeout(r,3000));
        const poll=await axios.get(`https://api.replicate.com/v1/predictions/${p.id}`,{headers:{Authorization:`Token ${process.env.REPLICATE_API_TOKEN}`}});
        p=poll.data;
      }
      videoUrl=p.output;
    }

    res.json({success:true, video_url:videoUrl, audio:audioBase64, language:detectedLang});
  }catch(err){
    res.status(500).json({success:false, error:err.message});
  }
});

app.listen(PORT, '0.0.0.0', ()=>console.log(`Server on ${PORT}`));
