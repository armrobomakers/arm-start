#property strict
#property script_show_inputs

#define REQUESTS "ARMIndicator/price-requests.csv"
#define TMP "ARMIndicator/historical-prices.csv.tmp"
#define OUT "ARMIndicator/historical-prices.csv"

bool Secure()
  {
   if(TerminalInfoInteger(TERMINAL_CONNECTED)!=1 || AccountInfoInteger(ACCOUNT_TRADE_ALLOWED)!=0 || AccountInfoString(ACCOUNT_SERVER)!="Tickmill-Live")
     { Print("CRITICAL: price exporter security check failed"); return false; }
   return true;
  }

int OnStart()
  {
   if(!Secure()) return 1;
   int input_file=FileOpen(REQUESTS,FILE_READ|FILE_CSV|FILE_ANSI|FILE_COMMON,';');
   if(input_file==INVALID_HANDLE) { PrintFormat("CRITICAL: request file open failed, error=%d",GetLastError()); return 2; }
   FolderCreate("ARMIndicator",FILE_COMMON); FileDelete(TMP,FILE_COMMON);
   int output=FileOpen(TMP,FILE_WRITE|FILE_CSV|FILE_ANSI|FILE_COMMON,';');
   if(output==INVALID_HANDLE) { FileClose(input_file); return 3; }
   FileReadString(input_file); FileReadString(input_file);
   FileWrite(output,"symbol","requested_server_time","actual_tick_time","bid","ask","gap_seconds","source","status","open","high","low","close","spread");
   int processed=0,found=0,m1_fallback=0,missing=0;
   while(!FileIsEnding(input_file))
     {
      string symbol=FileReadString(input_file);
      string requested=FileReadString(input_file);
      if(symbol=="" || requested=="") continue;
      datetime requested_time=StringToTime(requested);
      ulong requested_msc=(ulong)requested_time*1000;
      MqlTick ticks[];
      ulong from_msc=requested_msc>300000 ? requested_msc-300000 : 0;
      int tick_count=CopyTicksRange(symbol,ticks,COPY_TICKS_ALL,from_msc,requested_msc+1000);
      int selected=-1;
      for(int i=0;i<tick_count;i++) if((ulong)ticks[i].time_msc<=requested_msc && (ticks[i].bid>0 || ticks[i].ask>0)) selected=i;
      if(selected>=0)
        {
         long actual=ticks[selected].time_msc/1000;
         FileWrite(output,symbol,requested,TimeToString((datetime)actual,TIME_DATE|TIME_SECONDS),ticks[selected].bid,ticks[selected].ask,(long)requested_time-actual,"tick","ok","","","","","");
         found++;
        }
      else
        {
         MqlRates rates[];
         datetime from=requested_time>600 ? requested_time-600 : 0;
         int rate_count=CopyRates(symbol,PERIOD_M1,from,requested_time+60,rates);
         int rate_index=-1;
         for(int i=0;i<rate_count;i++) if(rates[i].time<=requested_time) rate_index=i;
         if(rate_index>=0)
           {
            long gap=(long)requested_time-(long)rates[rate_index].time;
            FileWrite(output,symbol,requested,TimeToString(rates[rate_index].time,TIME_DATE|TIME_SECONDS),"","",gap,"m1_fallback","ok",rates[rate_index].open,rates[rate_index].high,rates[rate_index].low,rates[rate_index].close,rates[rate_index].spread);
            m1_fallback++;
           }
         else
           { FileWrite(output,symbol,requested,"","","","","","missing","","","","",""); missing++; }
        }
      processed++;
      if(processed%100==0) PrintFormat("EXPORT PRICES %d",processed);
     }
   FileFlush(output); FileClose(input_file); FileClose(output);
   if(!FileMove(TMP,FILE_COMMON,OUT,FILE_COMMON|FILE_REWRITE)) { PrintFormat("CRITICAL: replacement failed, error=%d",GetLastError()); FileDelete(TMP,FILE_COMMON); return 4; }
   PrintFormat("PRICE EXPORT FINISHED requests=%d ticks=%d m1_fallbacks=%d missing=%d",processed,found,m1_fallback,missing);
   return 0;
  }
