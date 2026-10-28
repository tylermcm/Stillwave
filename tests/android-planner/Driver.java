package com.stillwave.plannerdriver;
import android.app.Instrumentation;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import org.json.JSONObject;
import org.json.JSONArray;
import java.lang.reflect.Method;
import java.net.URL;
import java.util.Map;

public class Driver extends Instrumentation {
  private Context context;
  private Object planner, engine;
  public void onCreate(Bundle args) { super.onCreate(args); start(); }
  private Object call(Object instance, String method, Class<?>[] types, Object... args) throws Exception { return instance.getClass().getMethod(method, types).invoke(instance,args); }
  private String plans() throws Exception { return (String)call(planner,"plans",new Class<?>[]{Context.class},context); }
  private JSONObject find(String id) throws Exception { JSONArray a=new JSONArray(plans());for(int i=0;i<a.length();i++)if(a.getJSONObject(i).getString("id").equals(id))return a.getJSONObject(i);throw new Exception("Missing job "+id); }
  private JSONObject schedule(String channel, String title, long start, long stop) throws Exception {
    JSONObject job=new JSONObject().put("channelId",channel).put("channelName","Planner Fixture").put("title",title).put("start",start).put("stop",stop).put("url","http://127.0.0.1:8096/live.m3u8").put("headers",new JSONObject()).put("episode","S1 E2");
    return new JSONObject((String)call(planner,"schedule",new Class<?>[]{Context.class,String.class},context,job.toString()));
  }
  private void cancel(String id) throws Exception { call(planner,"cancel",new Class<?>[]{Context.class,String.class},context,id); }
  private JSONObject awaitStatus(String id,String status,long deadline) throws Exception {
    JSONObject value;
    do {value=find(id);if(value.getString("status").equals(status))return value;Thread.sleep(250);}while(System.currentTimeMillis()<deadline);
    throw new Exception("Wanted "+status+", got "+value.toString());
  }
  private void check(boolean ok,String message) throws Exception { if(!ok)throw new Exception(message); }
  public void onStart() {
    Bundle result=new Bundle();
    try {
      context=getTargetContext();ClassLoader loader=context.getClassLoader();
      Class<?> plannerType=Class.forName("expo.modules.stillwavedvr.RecordingPlanner",true,loader);planner=plannerType.getField("INSTANCE").get(null);
      Class<?> runtimeType=Class.forName("expo.modules.stillwavedvr.DvrRuntime",true,loader);Object runtime=runtimeType.getField("INSTANCE").get(null);engine=call(runtime,"engine",new Class<?>[]{Context.class},context);
      check((Boolean)call(planner,"precise",new Class<?>[]{Context.class},context),"Exact-alarm access missing in isolated test");
      long now=System.currentTimeMillis();String channel="planner-test-"+now;
      JSONObject first=schedule(channel,"Scheduled test",now+3000,now+18000);
      JSONObject duplicate=schedule(channel,"Scheduled test",now+3000,now+18000);
      check(first.getString("id").equals(duplicate.getString("id")),"Duplicate scheduled job");
      JSONObject second=schedule(channel+"-other","Conflicting test",now+7000,now+15000);
      JSONObject cancelled=schedule(channel+"-cancelled","Cancelled test",now+9000,now+20000);cancel(cancelled.getString("id"));
      getUiAutomation().executeShellCommand("input keyevent KEYCODE_HOME").close();
      JSONObject running=awaitStatus(first.getString("id"),"recording",now+13000);
      check(!running.getString("recordingId").isEmpty(),"No actual recording file");
      JSONObject conflict=awaitStatus(second.getString("id"),"conflict",now+16000);
      check(conflict.getString("error").contains("Only one stream"),"No honest stream conflict");
      check(find(cancelled.getString("id")).getString("status").equals("cancelled"),"Cancelled job was resurrected");
      JSONObject finished=awaitStatus(first.getString("id"),"completed",now+24000);
      String recordingId=running.getString("recordingId");
      call(engine,"savePosition",new Class<?>[]{String.class,double.class},recordingId,3.0);
      Map record=(Map)call(engine,"recordingSource",new Class<?>[]{String.class},recordingId);
      check(((Number)record.get("duration")).doubleValue()>=2,"Scheduled recording contains no video");
      check(((Number)record.get("position")).doubleValue()==3,"Resume position not saved");
      check(record.get("episode").equals("S1 E2"),"Real episode metadata lost");
      String manifest=new String(new URL((String)record.get("uri")).openStream().readAllBytes(),"UTF-8");
      check(manifest.contains("#EXT-X-ENDLIST"),"Recording was not finalized");
      JSONObject rule=new JSONObject().put("channelId",channel).put("channelName","Fixture").put("title","A series");
      JSONObject added=new JSONObject((String)call(planner,"addRule",new Class<?>[]{Context.class,String.class},context,rule.toString()));
      JSONObject again=new JSONObject((String)call(planner,"addRule",new Class<?>[]{Context.class,String.class},context,rule.toString()));
      check(added.getString("id").equals(again.getString("id")),"Duplicate series rule");
      call(planner,"removeRule",new Class<?>[]{Context.class,String.class},context,added.getString("id"));
      check(!((String)call(planner,"rules",new Class<?>[]{Context.class},context)).contains(added.getString("id")),"Series rule was not removed");
      JSONObject evidence=new JSONObject().put("passed",true).put("duration",record.get("duration")).put("bytes",record.get("bytes")).put("status",record.get("status")).put("conflict",conflict.getString("error")).put("checks",new JSONArray(new String[]{"alarm starts real HLS capture in background","duplicates deduplicated","second stream refused","cancelled job stays cancelled","scheduled end finalizes video","resume position persisted","episode metadata kept","series rule persists and removes"}));
      result.putString("evidence",evidence.toString());
      cancel(first.getString("id"));cancel(second.getString("id"));cancel(cancelled.getString("id"));
      call(engine,"releaseRecording",new Class<?>[]{String.class},recordingId);
      call(engine,"deleteRecording",new Class<?>[]{String.class},recordingId);
      finish(-1,result);
    } catch(Throwable error) {
      Throwable cause=error;while(cause.getCause()!=null)cause=cause.getCause();result.putString("error",cause.toString());finish(0,result);
    }
  }
}
